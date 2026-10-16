import { db, tx } from './db.js';
import { bus } from './bus.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const now = () => Date.now();

// ---------- configurações ----------
export function getSetting(key, fallback = null) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : fallback;
}
export function setSetting(key, value) {
  db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
              ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(key, String(value));
}
export const getSettings = () => ({
  auto_assign: getSetting('auto_assign', 'balanced'), // balanced | queue
  signature: getSetting('signature', '0'),            // 1 = assina "*Nome:*" nas mensagens
});

// ---------- usuários ----------
export const getUser = (id) =>
  db.prepare('SELECT id,name,email,role,color,active FROM users WHERE id=?').get(id);

export function listUsers() {
  return db.prepare(`
    SELECT u.id,u.name,u.email,u.role,u.color,u.active,
      (SELECT COUNT(*) FROM conversations c WHERE c.assigned_to=u.id AND c.status='open') AS open_count,
      (SELECT COUNT(*) FROM conversations c WHERE c.assigned_to=u.id AND c.unread>0) AS unread_count
    FROM users u ORDER BY u.role='admin' DESC, u.name COLLATE NOCASE`).all();
}

// ---------- contatos e conversas ----------
export function upsertContact({ jid, phone, pushName }) {
  let c = db.prepare('SELECT * FROM contacts WHERE jid=?').get(jid);
  if (!c && phone) c = db.prepare('SELECT * FROM contacts WHERE phone=?').get(phone);
  if (c) {
    if (pushName && pushName !== c.push_name) {
      db.prepare('UPDATE contacts SET push_name=? WHERE id=?').run(pushName, c.id);
      c.push_name = pushName;
    }
    return c;
  }
  const r = db.prepare('INSERT INTO contacts(jid,phone,push_name,created_at) VALUES(?,?,?,?)')
    .run(jid, phone || null, pushName || null, now());
  return db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(r.lastInsertRowid));
}

function pickAssignee() {
  if (getSetting('auto_assign', 'balanced') !== 'balanced') return null;
  const row = db.prepare(`
    SELECT u.id,
      (SELECT COUNT(*) FROM conversations c WHERE c.assigned_to=u.id AND c.status='open') AS load
    FROM users u WHERE u.active=1 AND u.role='agent'
    ORDER BY load ASC, u.id ASC LIMIT 1`).get();
  return row ? row.id : null;
}

export function getOrCreateConversation(contactId) {
  const ex = db.prepare('SELECT * FROM conversations WHERE contact_id=?').get(contactId);
  if (ex) {
    // dono desativado → volta para a fila
    if (ex.assigned_to && !getUser(ex.assigned_to)?.active) {
      db.prepare('UPDATE conversations SET assigned_to=? WHERE id=?').run(pickAssignee(), ex.id);
      return db.prepare('SELECT * FROM conversations WHERE id=?').get(ex.id);
    }
    return ex;
  }
  const r = db.prepare('INSERT INTO conversations(contact_id,assigned_to,created_at) VALUES(?,?,?)')
    .run(contactId, pickAssignee(), now());
  return db.prepare('SELECT * FROM conversations WHERE id=?').get(Number(r.lastInsertRowid));
}

const CONV_SELECT = `
  SELECT c.id, c.assigned_to, c.status, c.unread, c.last_message_at, c.last_preview, c.created_at,
         ct.id AS contact_id, ct.jid, ct.phone,
         COALESCE(NULLIF(ct.name,''), NULLIF(ct.push_name,''), ct.phone) AS name
  FROM conversations c JOIN contacts ct ON ct.id = c.contact_id`;

export const conversationView = (id) => db.prepare(`${CONV_SELECT} WHERE c.id=?`).get(id);

export const canAccess = (user, conv) =>
  !!conv && (user.role === 'admin' || conv.assigned_to === user.id);

export function listConversations(user, { status, q, owner } = {}) {
  const where = [];
  const params = [];
  if (user.role !== 'admin') {
    where.push('c.assigned_to = ?');
    params.push(user.id);
  } else if (owner === 'queue') {
    where.push('c.assigned_to IS NULL');
  } else if (owner) {
    where.push('c.assigned_to = ?');
    params.push(Number(owner));
  }
  if (status === 'open' || status === 'resolved') {
    where.push('c.status = ?');
    params.push(status);
  }
  if (q) {
    const like = `%${q}%`;
    where.push(`(ct.name LIKE ? OR ct.push_name LIKE ? OR ct.phone LIKE ?
      OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.type!='system' AND m.body LIKE ?))`);
    params.push(like, like, like, like);
  }
  const sql = `${CONV_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 500`;
  return db.prepare(sql).all(...params);
}

// ---------- mensagens ----------
const PREVIEW = {
  image: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', document: '📄 Documento',
  sticker: 'Figurinha', location: '📍 Localização', contact: '👤 Contato',
};
const previewOf = (type, body) =>
  body ? String(body).replace(/\s+/g, ' ').slice(0, 140) : (PREVIEW[type] || 'Mensagem');

const MSG_SELECT = `
  SELECT m.*, u.name AS sender_name, (b.message_id IS NOT NULL) AS has_media
  FROM messages m
  LEFT JOIN users u ON u.id = m.sender_user_id
  LEFT JOIN media_blobs b ON b.message_id = m.id`;

const messageView = (r) => r && ({
  id: r.id,
  conversation_id: r.conversation_id,
  direction: r.direction,
  type: r.type,
  body: r.body,
  media_url: r.has_media ? `/media/${r.id}` : null,
  media_mime: r.media_mime,
  media_name: r.media_name,
  media_size: r.media_size,
  status: r.status,
  sender_user_id: r.sender_user_id,
  sender_name: r.sender_name,
  created_at: r.created_at,
});

export const getMessage = (id) => messageView(db.prepare(`${MSG_SELECT} WHERE m.id=?`).get(id));

export function listMessages(conversationId, before, limit = 80) {
  const rows = db.prepare(`${MSG_SELECT} WHERE m.conversation_id=? AND m.id<? ORDER BY m.id DESC LIMIT ?`)
    .all(conversationId, before || Number.MAX_SAFE_INTEGER, limit + 1);
  const hasMore = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse().map(messageView), hasMore };
}

// Insere sem emitir (usado dentro de transações).
function insertMessage(f) {
  const r = db.prepare(`
    INSERT INTO messages(conversation_id,wa_id,direction,type,body,media_mime,media_name,media_size,status,sender_user_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
    f.conversationId, f.waId ?? null, f.direction, f.type || 'text', f.body ?? null,
    f.media?.mime ?? null, f.media?.name ?? null, f.media?.buffer?.length ?? null,
    f.status ?? null, f.senderUserId ?? null, f.createdAt ?? now());
  const id = Number(r.lastInsertRowid);
  if (f.media?.buffer) {
    db.prepare('INSERT INTO media_blobs(message_id,data) VALUES(?,?)').run(id, f.media.buffer);
  }
  return id;
}

export function messageExists(waId) {
  return !!db.prepare('SELECT 1 FROM messages WHERE wa_id=?').get(waId);
}

/** Salva uma mensagem de conversa (entrada/saída), atualiza a conversa e avisa o tempo real. */
export function saveMessage(f) {
  if (f.waId) {
    const ex = db.prepare('SELECT id,sender_user_id FROM messages WHERE wa_id=?').get(f.waId);
    if (ex) {
      if (f.senderUserId && !ex.sender_user_id) {
        db.prepare('UPDATE messages SET sender_user_id=? WHERE id=?').run(f.senderUserId, ex.id);
        bus.emit('message:update', getMessage(ex.id));
      }
      return { message: getMessage(ex.id), created: false };
    }
  }
  const id = tx(() => {
    const mid = insertMessage(f);
    const at = f.createdAt ?? now();
    db.prepare(`
      UPDATE conversations SET
        last_preview = CASE WHEN ? >= COALESCE(last_message_at,0) THEN ? ELSE last_preview END,
        last_message_at = MAX(COALESCE(last_message_at,0), ?),
        unread = unread + ?,
        status = CASE WHEN ?='in' THEN 'open' ELSE status END
      WHERE id=?`).run(
      at, previewOf(f.type, f.body), at,
      f.direction === 'in' ? 1 : 0, f.direction, f.conversationId);
    return mid;
  });
  const message = getMessage(id);
  bus.emit('message:new', message);
  bus.emit('conversation:update', f.conversationId);
  return { message, created: true };
}

/** Nota interna (não vai para o WhatsApp). */
export function addNote(conversationId, user, text) {
  const id = tx(() => insertMessage({
    conversationId, direction: 'internal', type: 'note', body: text, senderUserId: user.id,
  }));
  const message = getMessage(id);
  bus.emit('message:new', message);
  return message;
}

const RANK = { sent: 1, delivered: 2, read: 3, played: 4 };
export function updateMessageStatus(waId, status) {
  const m = db.prepare('SELECT id,status FROM messages WHERE wa_id=?').get(waId);
  if (!m || (RANK[m.status] || 0) >= (RANK[status] || 0)) return;
  db.prepare('UPDATE messages SET status=? WHERE id=?').run(status, m.id);
  bus.emit('message:update', getMessage(m.id));
}

export function markRead(conversationId) {
  const r = db.prepare('UPDATE conversations SET unread=0 WHERE id=? AND unread>0').run(conversationId);
  if (r.changes) bus.emit('conversation:update', conversationId);
}

export function getMedia(messageId) {
  const row = db.prepare(`
    SELECT m.conversation_id, m.media_mime, m.media_name, b.data
    FROM messages m JOIN media_blobs b ON b.message_id = m.id WHERE m.id=?`).get(messageId);
  if (!row) return null;
  return { ...row, data: Buffer.from(row.data.buffer, row.data.byteOffset, row.data.byteLength) };
}

/** Entrada única para tudo que vem do WhatsApp (real ou demo). */
export function ingestWhatsApp(p) {
  const contact = upsertContact({
    jid: p.jid, phone: p.phone, pushName: p.fromMe ? null : p.pushName,
  });
  const conv = getOrCreateConversation(contact.id);
  return saveMessage({
    conversationId: conv.id,
    waId: p.waId,
    direction: p.fromMe ? 'out' : 'in',
    type: p.type,
    body: p.body,
    media: p.media,
    status: p.fromMe ? 'sent' : null,
    createdAt: p.timestamp,
  });
}

// ---------- transferência ----------
/**
 * Passa a conversa para outro usuário (ou para a fila).
 * Só muda `assigned_to` — todas as mensagens, mídias, notas e o histórico permanecem na conversa
 * e passam a ser exibidos ao novo responsável. Quem transferiu (se atendente) deixa de ver a conversa.
 */
export function transferConversation({ conversationId, toUserId, byUser, note }) {
  const result = tx(() => {
    const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversationId);
    if (!conv || !canAccess(byUser, conv)) throw new HttpError(404, 'Conversa não encontrada');

    let toUser = null;
    if (toUserId != null) {
      toUser = getUser(Number(toUserId));
      if (!toUser || !toUser.active) throw new HttpError(400, 'Destinatário inválido');
    } else if (byUser.role !== 'admin') {
      throw new HttpError(403, 'Somente o administrador pode devolver à fila');
    }
    if ((conv.assigned_to ?? null) === (toUser?.id ?? null)) {
      throw new HttpError(400, 'A conversa já está com este usuário');
    }
    const from = conv.assigned_to ? getUser(conv.assigned_to) : null;
    const cleanNote = (note || '').trim() || null;

    db.prepare('UPDATE conversations SET assigned_to=?, unread=MAX(unread,1) WHERE id=?')
      .run(toUser?.id ?? null, conv.id);
    db.prepare(`INSERT INTO transfers(conversation_id,from_user_id,to_user_id,by_user_id,note,created_at)
                VALUES(?,?,?,?,?,?)`).run(conv.id, from?.id ?? null, toUser?.id ?? null, byUser.id, cleanNote, now());

    const sysId = insertMessage({
      conversationId: conv.id, direction: 'internal', type: 'system',
      body: `${byUser.name} transferiu a conversa de ${from?.name ?? 'Fila de entrada'} para ${toUser?.name ?? 'Fila de entrada'}`,
      senderUserId: byUser.id,
    });
    const noteId = cleanNote
      ? insertMessage({ conversationId: conv.id, direction: 'internal', type: 'note', body: cleanNote, senderUserId: byUser.id })
      : null;
    return { conv, fromId: from?.id ?? null, toId: toUser?.id ?? null, toName: toUser?.name ?? 'Fila de entrada', sysId, noteId };
  });

  // eventos só depois do commit, já com o novo dono
  bus.emit('conversation:transferred', { conversationId, fromId: result.fromId, toId: result.toId, toName: result.toName });
  bus.emit('message:new', getMessage(result.sysId));
  if (result.noteId) bus.emit('message:new', getMessage(result.noteId));
  bus.emit('conversation:update', conversationId);
  return conversationView(conversationId);
}

export function listTransfers(conversationId) {
  return db.prepare(`
    SELECT t.id, t.created_at, t.note,
      t.from_user_id, t.to_user_id, t.by_user_id,
      f.name AS from_name, o.name AS to_name, b.name AS by_name
    FROM transfers t
    LEFT JOIN users f ON f.id=t.from_user_id
    LEFT JOIN users o ON o.id=t.to_user_id
    JOIN users b ON b.id=t.by_user_id
    WHERE t.conversation_id=? ORDER BY t.id DESC`).all(conversationId);
}

export function recentTransfers(limit = 40) {
  return db.prepare(`
    SELECT t.id, t.conversation_id, t.created_at, t.note,
      f.name AS from_name, o.name AS to_name, b.name AS by_name,
      COALESCE(NULLIF(ct.name,''), NULLIF(ct.push_name,''), ct.phone) AS contact_name
    FROM transfers t
    LEFT JOIN users f ON f.id=t.from_user_id
    LEFT JOIN users o ON o.id=t.to_user_id
    JOIN users b ON b.id=t.by_user_id
    JOIN conversations c ON c.id=t.conversation_id
    JOIN contacts ct ON ct.id=c.contact_id
    ORDER BY t.id DESC LIMIT ?`).all(limit);
}

/** Usado ao desativar um atendente: devolve as conversas dele para a fila (nada é perdido). */
export function releaseConversationsOf(userId, byUser) {
  const rows = db.prepare('SELECT id FROM conversations WHERE assigned_to=?').all(userId);
  for (const r of rows) {
    transferConversation({ conversationId: r.id, toUserId: null, byUser, note: 'Atendente desativado' });
  }
  return rows.length;
}

export function setConversationStatus(conversationId, status) {
  db.prepare('UPDATE conversations SET status=? WHERE id=?').run(status, conversationId);
  bus.emit('conversation:update', conversationId);
}

export function renameContact(contactId, name) {
  db.prepare('UPDATE contacts SET name=? WHERE id=?').run(name || null, contactId);
  const conv = db.prepare('SELECT id FROM conversations WHERE contact_id=?').get(contactId);
  if (conv) bus.emit('conversation:update', conv.id);
}

export function stats() {
  return {
    conversations: db.prepare('SELECT COUNT(*) n FROM conversations').get().n,
    messages: db.prepare("SELECT COUNT(*) n FROM messages WHERE type NOT IN ('system','note')").get().n,
    queue: db.prepare("SELECT COUNT(*) n FROM conversations WHERE assigned_to IS NULL AND status='open'").get().n,
    transfers: db.prepare('SELECT COUNT(*) n FROM transfers').get().n,
  };
}
