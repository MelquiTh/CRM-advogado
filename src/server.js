import express from 'express';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { DEMO, PORT, HOST, MAX_AGENTS, DATA_DIR } from './config.js';
import { db, DB_FILE, tx } from './db.js';
import { bus } from './bus.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, destroyUserSessions,
  userFromToken, parseCookies, sessionCookie,
} from './auth.js';
import * as svc from './services.js';
import { HttpError } from './services.js';
import { wa } from './whatsapp.js';
import { setupRealtime } from './realtime.js';
import { seedDemo } from './demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------- primeiro uso: cria o administrador ----------
function ensureAdmin() {
  if (db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) return;
  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!DEMO && !configuredEmail && !configuredPassword) return;
  if (!DEMO && (!configuredEmail || !configuredPassword)) {
    throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD juntos ou crie a conta pela tela inicial.');
  }
  const email = configuredEmail || 'admin@crm.local';
  const password = configuredPassword || 'admin123';
  db.prepare("INSERT INTO users(name,email,password_hash,role,color,active,created_at) VALUES(?,?,?,'admin',?,1,?)")
    .run('Administrador', email, hashPassword(password), '#111827', Date.now());
  if (DEMO) {
    console.log('\n==========================================================');
    console.log(' Administrador criado');
    console.log(`   E-mail: ${email}`);
    console.log(`   Senha : ${password}`);
    console.log('==========================================================\n');
  }
}
ensureAdmin();
if (DEMO) seedDemo();

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function auth(req, res, next) {
  const user = userFromToken(parseCookies(req.headers.cookie).sid);
  if (!user) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  req.user = user;
  next();
}
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Acesso restrito ao administrador' });

function loadConv(req) {
  const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(Number(req.params.id));
  // 404 (e não 403) para não revelar a existência de conversas de outras pessoas
  if (!conv || !svc.canAccess(req.user, conv)) throw new HttpError(404, 'Conversa não encontrada');
  return conv;
}

// ---------- envio de arquivo (corpo bruto; precisa vir antes do express.json) ----------
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

app.post('/api/conversations/:id/media', auth, express.raw({ type: () => true, limit: '64mb' }), ah(async (req, res) => {
  const conv = loadConv(req);
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HttpError(400, 'Arquivo vazio');
  const mime = (req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
  const name = safeDecode(String(req.headers['x-filename'] || 'arquivo')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  const caption = safeDecode(String(req.headers['x-caption'] || '')).trim();
  const kind = /^image\/(jpeg|png|gif|webp)$/.test(mime) ? 'image'
    : mime.startsWith('video/') ? 'video'
      : mime.startsWith('audio/') ? 'audio' : 'document';
  const contact = db.prepare('SELECT jid FROM contacts WHERE id=?').get(conv.contact_id);
  const waId = await wa.sendMedia(contact.jid, { buffer, mime, filename: name, caption, kind });
  const { message } = svc.saveMessage({
    conversationId: conv.id, waId, direction: 'out', type: kind, body: caption || null,
    media: { buffer, mime, name }, status: 'sent', senderUserId: req.user.id,
  });
  res.json({ message });
}));

app.use(express.json({ limit: '1mb' }));

// ---------- autenticação ----------
const attempts = new Map();
app.get('/api/setup', (req, res) => {
  res.json({ required: !db.prepare("SELECT 1 FROM users WHERE role='admin'").get() });
});

app.post('/api/setup', ah(async (req, res) => {
  const { name, email, password } = req.body || {};
  const normalizedName = String(name || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!normalizedName || normalizedName.length > 60 || !emailPattern.test(normalizedEmail)) {
    throw new HttpError(400, 'Informe nome e e-mail válidos');
  }
  if (String(password || '').length < 6) throw new HttpError(400, 'A senha precisa ter ao menos 6 caracteres');

  const result = tx(() => {
    if (db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
      throw new HttpError(409, 'A conta de administrador já foi criada');
    }
    return db.prepare("INSERT INTO users(name,email,password_hash,role,color,active,created_at) VALUES(?,?,?,'admin',?,1,?)")
      .run(normalizedName, normalizedEmail, hashPassword(String(password)), '#111827', Date.now());
  });
  const userId = Number(result.lastInsertRowid);
  res.setHeader('Set-Cookie', sessionCookie(createSession(userId)));
  res.status(201).json({ user: svc.getUser(userId) });
}));

app.post('/api/login', ah(async (req, res) => {
  const key = req.ip;
  const a = attempts.get(key);
  if (a && a.until > Date.now()) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const { email, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || ''));
  if (!row || !row.active || !verifyPassword(String(password || ''), row.password_hash)) {
    const n = (a?.count || 0) + 1;
    attempts.set(key, { count: n, until: n >= 8 ? Date.now() + 10 * 60000 : 0 });
    throw new HttpError(401, 'E-mail ou senha incorretos');
  }
  attempts.delete(key);
  res.setHeader('Set-Cookie', sessionCookie(createSession(row.id)));
  res.json({ user: svc.getUser(row.id) });
}));

app.post('/api/logout', (req, res) => {
  destroySession(parseCookies(req.headers.cookie).sid);
  res.setHeader('Set-Cookie', sessionCookie('', true));
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

app.post('/api/me/password', auth, ah(async (req, res) => {
  const { current, next } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(String(current || ''), row.password_hash)) throw new HttpError(400, 'Senha atual incorreta');
  if (String(next || '').length < 6) throw new HttpError(400, 'A nova senha precisa ter ao menos 6 caracteres');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(next)), req.user.id);
  res.json({ ok: true });
}));

// ---------- usuários ----------
app.get('/api/users', auth, (req, res) => {
  const users = svc.listUsers();
  res.json({
    users: req.user.role === 'admin' ? users : users.map(({ email, open_count, unread_count, ...u }) => u),
    max_agents: MAX_AGENTS,
  });
});

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const activeAgents = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role='agent' AND active=1").get().n;

app.post('/api/users', auth, adminOnly, ah(async (req, res) => {
  const { name, email, password, color } = req.body || {};
  if (!String(name || '').trim() || !String(email || '').includes('@')) throw new HttpError(400, 'Informe nome e e-mail válidos');
  if (String(password || '').length < 6) throw new HttpError(400, 'A senha precisa ter ao menos 6 caracteres');
  if (activeAgents() >= MAX_AGENTS) throw new HttpError(400, `Limite de ${MAX_AGENTS} atendentes ativos atingido`);
  try {
    const r = db.prepare("INSERT INTO users(name,email,password_hash,role,color,active,created_at) VALUES(?,?,?,'agent',?,1,?)")
      .run(String(name).trim(), String(email).trim(), hashPassword(String(password)),
        COLOR_RE.test(color) ? color : '#0ea5e9', Date.now());
    bus.emit('users:changed');
    res.json({ user: svc.getUser(Number(r.lastInsertRowid)) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Já existe um usuário com este e-mail');
    throw e;
  }
}));

app.patch('/api/users/:id', auth, adminOnly, ah(async (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!target) throw new HttpError(404, 'Usuário não encontrado');
  const { name, email, password, color, active } = req.body || {};

  if (active !== undefined) {
    if (target.role === 'admin' && !active) throw new HttpError(400, 'O administrador não pode ser desativado');
    if (active && !target.active && activeAgents() >= MAX_AGENTS) throw new HttpError(400, `Limite de ${MAX_AGENTS} atendentes ativos atingido`);
  }
  try {
    if (name !== undefined && String(name).trim()) db.prepare('UPDATE users SET name=? WHERE id=?').run(String(name).trim(), id);
    if (email !== undefined && String(email).includes('@')) db.prepare('UPDATE users SET email=? WHERE id=?').run(String(email).trim(), id);
    if (color !== undefined && COLOR_RE.test(color)) db.prepare('UPDATE users SET color=? WHERE id=?').run(color, id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Já existe um usuário com este e-mail');
    throw e;
  }
  if (password) {
    if (String(password).length < 6) throw new HttpError(400, 'A senha precisa ter ao menos 6 caracteres');
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(password)), id);
    destroyUserSessions(id);
    bus.emit('users:disconnect', id);
  }
  if (active !== undefined && Boolean(active) !== Boolean(target.active)) {
    if (!active) {
      // nenhuma conversa fica "órfã": volta para a fila com todo o histórico
      svc.releaseConversationsOf(id, req.user);
      destroyUserSessions(id);
      bus.emit('users:disconnect', id);
    }
    db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, id);
  }
  bus.emit('users:changed');
  res.json({ user: svc.getUser(id) });
}));

// ---------- conversas ----------
app.get('/api/conversations', auth, (req, res) => {
  const { status, q, owner } = req.query;
  res.json({ conversations: svc.listConversations(req.user, { status, q: String(q || '').trim(), owner }) });
});

app.get('/api/conversations/:id', auth, ah(async (req, res) => {
  const conv = loadConv(req);
  const { messages, hasMore } = svc.listMessages(conv.id);
  if (conv.assigned_to === req.user.id) svc.markRead(conv.id); // admin só espiando não zera o "não lido" do dono
  res.json({
    conversation: svc.conversationView(conv.id),
    messages, hasMore,
    transfers: svc.listTransfers(conv.id),
  });
}));

app.get('/api/conversations/:id/messages', auth, ah(async (req, res) => {
  const conv = loadConv(req);
  res.json(svc.listMessages(conv.id, Number(req.query.before) || undefined));
}));

app.post('/api/conversations/:id/read', auth, ah(async (req, res) => {
  const conv = loadConv(req);
  if (conv.assigned_to === req.user.id) svc.markRead(conv.id);
  res.json({ ok: true });
}));

app.post('/api/conversations/:id/messages', auth, ah(async (req, res) => {
  const conv = loadConv(req);
  const text = String(req.body?.text || '').trim();
  if (!text) throw new HttpError(400, 'Mensagem vazia');
  if (text.length > 4000) throw new HttpError(400, 'Mensagem muito longa');
  const contact = db.prepare('SELECT jid FROM contacts WHERE id=?').get(conv.contact_id);
  const finalText = svc.getSetting('signature', '0') === '1' ? `*${req.user.name}:*\n${text}` : text;
  const waId = await wa.sendText(contact.jid, finalText);
  const { message } = svc.saveMessage({
    conversationId: conv.id, waId, direction: 'out', type: 'text', body: finalText,
    status: 'sent', senderUserId: req.user.id,
  });
  res.json({ message });
}));

app.post('/api/conversations/:id/notes', auth, ah(async (req, res) => {
  const conv = loadConv(req);
  const text = String(req.body?.text || '').trim();
  if (!text) throw new HttpError(400, 'Nota vazia');
  res.json({ message: svc.addNote(conv.id, req.user, text) });
}));

app.post('/api/conversations/:id/transfer', auth, ah(async (req, res) => {
  const conv = loadConv(req);
  const { toUserId, note } = req.body || {};
  const view = svc.transferConversation({
    conversationId: conv.id,
    toUserId: toUserId === null || toUserId === undefined ? null : Number(toUserId),
    byUser: req.user,
    note,
  });
  res.json({ conversation: view });
}));

app.post('/api/conversations/:id/status', auth, ah(async (req, res) => {
  const conv = loadConv(req);
  const status = req.body?.status;
  if (!['open', 'resolved'].includes(status)) throw new HttpError(400, 'Status inválido');
  svc.setConversationStatus(conv.id, status);
  res.json({ conversation: svc.conversationView(conv.id) });
}));

app.patch('/api/contacts/:id', auth, ah(async (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE contact_id=?').get(Number(req.params.id));
  if (!conv || !svc.canAccess(req.user, conv)) throw new HttpError(404, 'Contato não encontrado');
  svc.renameContact(conv.contact_id, String(req.body?.name || '').trim().slice(0, 80));
  res.json({ conversation: svc.conversationView(conv.id) });
}));

// ---------- mídia (do banco, com checagem de acesso) ----------
app.get('/media/:id', auth, ah(async (req, res) => {
  const m = svc.getMedia(Number(req.params.id));
  if (!m) throw new HttpError(404, 'Arquivo não encontrado');
  const conv = db.prepare('SELECT * FROM conversations WHERE id=?').get(m.conversation_id);
  if (!svc.canAccess(req.user, conv)) throw new HttpError(404, 'Arquivo não encontrado');

  const mime = m.media_mime || 'application/octet-stream';
  const inline = /^(image\/(jpeg|png|gif|webp)|video\/|audio\/|application\/pdf)/.test(mime);
  const fname = encodeURIComponent(m.media_name || `arquivo-${req.params.id}`);
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${fname}`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Accept-Ranges', 'bytes');

  const size = m.data.length;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] === '' || range[2] === '' ? size - 1 : Number(range[2]);
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    return res.end(m.data.subarray(start, end + 1));
  }
  res.setHeader('Content-Length', size);
  res.end(m.data);
}));

// ---------- WhatsApp / admin ----------
app.get('/api/whatsapp', auth, (req, res) => res.json(wa.state(req.user.role === 'admin')));
app.post('/api/whatsapp/restart', auth, adminOnly, ah(async (req, res) => {
  await wa.restart();
  res.json(wa.state(true));
}));
app.post('/api/whatsapp/logout', auth, adminOnly, ah(async (req, res) => {
  await wa.logout();
  res.json(wa.state(true));
}));

app.get('/api/settings', auth, adminOnly, (req, res) => res.json({ settings: svc.getSettings(), stats: svc.stats() }));
app.patch('/api/settings', auth, adminOnly, (req, res) => {
  const { auto_assign, signature } = req.body || {};
  if (['balanced', 'queue'].includes(auto_assign)) svc.setSetting('auto_assign', auto_assign);
  if (signature !== undefined) svc.setSetting('signature', signature ? '1' : '0');
  res.json({ settings: svc.getSettings() });
});

app.get('/api/admin/transfers', auth, adminOnly, (req, res) => res.json({ transfers: svc.recentTransfers() }));

app.get('/api/admin/backup', auth, adminOnly, ah(async (req, res) => {
  const tmp = path.join(DATA_DIR, `backup-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.download(tmp, `crm-backup-${stamp}.db`, () => fs.rm(tmp, { force: true }, () => {}));
}));

// ---------- estático e erros ----------
app.use(express.static(PUBLIC_DIR));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error('[erro]', err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'Erro interno do servidor' : err.message });
});

// ---------- start ----------
const server = http.createServer(app);
setupRealtime(server);

server.listen(PORT, HOST, () => {
  console.log(`CRM WhatsApp ${DEMO ? '(MODO DEMONSTRAÇÃO) ' : ''}rodando:`);
  console.log(`  Neste computador: http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  Na rede local:    http://${i.address}:${PORT}`);
  }
  console.log(`  Banco de dados:   ${DB_FILE}`);
  if (DEMO) console.log('  Demo: admin@crm.local / admin123  |  ana@crm.local, bruno@crm.local... / demo123');
  wa.start().catch((e) => console.error('[whatsapp]', e));
});

process.on('SIGINT', () => process.exit(0));
