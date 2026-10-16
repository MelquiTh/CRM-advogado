import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import pino from 'pino';
import { DATA_DIR, DEMO } from './config.js';
import { ingestWhatsApp, messageExists, updateMessageStatus } from './services.js';

/** Estado público: { status: 'disconnected'|'connecting'|'qr'|'connected', number, mode, error } */
class BaseProvider extends EventEmitter {
  constructor(mode) {
    super();
    this.mode = mode;
    this.status = 'disconnected';
    this.number = null;
    this.qr = null;
    this.error = null;
  }
  setState(patch) {
    Object.assign(this, patch);
    this.emit('state', this.state());
  }
  state(includeQr = false) {
    const s = { status: this.status, number: this.number, mode: this.mode, error: this.error };
    if (includeQr) s.qr = this.qr;
    return s;
  }
}

// ======================= WhatsApp real (Baileys) =======================
const AUTH_DIR = path.join(DATA_DIR, 'wa-auth');

function unwrap(msg) {
  let m = msg;
  for (let i = 0; i < 5; i++) {
    const inner = m?.ephemeralMessage?.message || m?.viewOnceMessage?.message
      || m?.viewOnceMessageV2?.message || m?.documentWithCaptionMessage?.message
      || m?.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function describe(m) {
  if (!m) return null;
  const keys = Object.keys(m).filter((k) => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage');
  if (!keys.length || ['protocolMessage', 'reactionMessage', 'pollUpdateMessage'].includes(keys[0])) return null;
  if (m.conversation) return { type: 'text', body: m.conversation };
  if (m.extendedTextMessage) return { type: 'text', body: m.extendedTextMessage.text };
  if (m.imageMessage) return { type: 'image', body: m.imageMessage.caption || '', media: m.imageMessage.mimetype };
  if (m.videoMessage) return { type: 'video', body: m.videoMessage.caption || '', media: m.videoMessage.mimetype };
  if (m.audioMessage) return { type: 'audio', body: '', media: m.audioMessage.mimetype };
  if (m.documentMessage) {
    return { type: 'document', body: m.documentMessage.caption || '', media: m.documentMessage.mimetype, name: m.documentMessage.fileName };
  }
  if (m.stickerMessage) return { type: 'sticker', body: '', media: m.stickerMessage.mimetype || 'image/webp' };
  if (m.locationMessage) {
    const l = m.locationMessage;
    return { type: 'location', body: `📍 ${l.name || 'Localização'} (${l.degreesLatitude}, ${l.degreesLongitude})` };
  }
  if (m.contactMessage) return { type: 'contact', body: `👤 ${m.contactMessage.displayName || 'Contato'}` };
  if (m.buttonsResponseMessage) return { type: 'text', body: m.buttonsResponseMessage.selectedDisplayText || '' };
  if (m.listResponseMessage) return { type: 'text', body: m.listResponseMessage.title || '' };
  return { type: 'unsupported', body: '[Tipo de mensagem ainda não suportado]' };
}

const numberOf = (jid) => String(jid || '').split('@')[0].split(':')[0];

class BaileysProvider extends BaseProvider {
  constructor() {
    super('real');
    this.sock = null;
    this.baileys = null;
    this.stopped = false;
    this.logger = pino({ level: 'silent' });
  }

  async start() {
    this.stopped = false;
    try {
      const mod = await import('@whiskeysockets/baileys');
      // compatível com export CJS/ESM: junta exports nomeados e o objeto "default", se houver
      const root = mod.default && typeof mod.default === 'object' ? mod.default : {};
      this.baileys = {
        ...root, ...mod,
        makeWASocket: typeof mod.default === 'function' ? mod.default : (root.default || root.makeWASocket || mod.makeWASocket),
      };
    } catch (e) {
      this.setState({ status: 'disconnected', error: 'Biblioteca do WhatsApp não instalada. Rode "npm install".' });
      console.error('[whatsapp] Falha ao carregar o Baileys:', e.message);
      return;
    }
    await this.connect();
  }

  async connect() {
    const b = this.baileys;
    const makeWASocket = b.makeWASocket;
    const { state, saveCreds } = await b.useMultiFileAuthState(AUTH_DIR);
    let version;
    try { ({ version } = await b.fetchLatestBaileysVersion()); } catch { /* usa a padrão */ }

    this.setState({ status: 'connecting', error: null });
    const sock = makeWASocket({
      auth: state,
      version,
      logger: this.logger,
      browser: ['CRM WhatsApp', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
      if (sock !== this.sock) return;
      const { connection, lastDisconnect, qr } = u;
      if (qr) {
        this.qr = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
        this.setState({ status: 'qr' });
      }
      if (connection === 'open') {
        this.qr = null;
        this.setState({ status: 'connected', number: numberOf(sock.user?.id), error: null });
        console.log('[whatsapp] Conectado como', this.number);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === b.DisconnectReason.loggedOut;
        this.qr = null;
        this.setState({ status: 'disconnected', number: null });
        if (this.stopped) return;
        if (loggedOut) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          console.log('[whatsapp] Sessão encerrada no celular. Gerando novo QR...');
        }
        setTimeout(() => !this.stopped && this.connect().catch((e) => console.error('[whatsapp]', e)), loggedOut ? 1000 : 3000);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const m of messages) {
        try { await this.handle(m, type); } catch (e) { console.error('[whatsapp] erro ao processar mensagem:', e); }
      }
    });

    sock.ev.on('messages.update', (updates) => {
      for (const u of updates) {
        const st = { 2: 'sent', 3: 'delivered', 4: 'read', 5: 'played' }[u.update?.status];
        if (st && u.key?.id) updateMessageStatus(u.key.id, st);
      }
    });
  }

  async handle(m, upsertType) {
    const jid = m.key?.remoteJid;
    if (!jid || !m.message) return;
    if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return; // só conversas individuais
    const ts = Number(m.messageTimestamp || 0) * 1000 || Date.now();
    if (upsertType !== 'notify' && Date.now() - ts > 120000) return; // ignora histórico antigo
    const waId = m.key.id;
    if (messageExists(waId)) return;

    const info = describe(unwrap(m.message));
    if (!info) return;

    let media;
    if (info.media) {
      try {
        const buffer = await this.baileys.downloadMediaMessage(
          m, 'buffer', {}, { logger: this.logger, reuploadRequest: this.sock.updateMediaMessage });
        media = { buffer, mime: info.media, name: info.name };
      } catch (e) {
        console.error('[whatsapp] não foi possível baixar a mídia:', e.message);
        info.body = info.body || `[Mídia não pôde ser baixada: ${info.type}]`;
      }
    }

    const alt = m.key.remoteJidAlt;
    ingestWhatsApp({
      jid,
      phone: numberOf(alt || jid),
      pushName: m.pushName,
      waId,
      fromMe: !!m.key.fromMe,
      type: info.type,
      body: info.body,
      media,
      timestamp: ts,
    });
  }

  assertReady() {
    if (!this.sock || this.status !== 'connected') {
      const e = new Error('WhatsApp desconectado. Peça ao administrador para reconectar.');
      e.status = 503;
      throw e;
    }
  }

  async sendText(jid, text) {
    this.assertReady();
    const res = await this.sock.sendMessage(jid, { text });
    return res.key.id;
  }

  async sendMedia(jid, { buffer, mime, filename, caption, kind }) {
    this.assertReady();
    let content;
    if (kind === 'image') content = { image: buffer, caption: caption || undefined };
    else if (kind === 'video') content = { video: buffer, caption: caption || undefined };
    else if (kind === 'audio') content = { audio: buffer, mimetype: mime };
    else content = { document: buffer, mimetype: mime, fileName: filename, caption: caption || undefined };
    const res = await this.sock.sendMessage(jid, content);
    return res.key.id;
  }

  async restart() {
    await this.shutdown();
    this.stopped = false;
    await this.connect();
  }

  async logout() {
    this.stopped = true;
    try { await this.sock?.logout(); } catch { /* já desconectado */ }
    try { this.sock?.end?.(undefined); } catch { /* ignore */ }
    this.sock = null;
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    this.qr = null;
    this.setState({ status: 'disconnected', number: null });
    this.stopped = false;
    await this.connect();
  }

  async shutdown() {
    this.stopped = true;
    try { this.sock?.end?.(undefined); } catch { /* ignore */ }
    this.sock = null;
  }
}

// ======================= Modo demonstração =======================
const AUTO_REPLIES = [
  'Entendi, obrigado!', 'Pode me mandar mais detalhes?', 'Perfeito, fico no aguardo 🙂',
  'Combinado!', 'Qual o prazo?', 'Muito obrigado pela atenção!',
];

class DemoProvider extends BaseProvider {
  constructor() {
    super('demo');
    this.seq = 0;
  }
  async start() {
    this.setState({ status: 'connected', number: '5561999990000' });
  }
  async sendText(jid) {
    this.scheduleReply(jid);
    return `DEMO-${Date.now()}-${++this.seq}`;
  }
  async sendMedia(jid) {
    this.scheduleReply(jid);
    return `DEMO-${Date.now()}-${++this.seq}`;
  }
  scheduleReply(jid) {
    setTimeout(() => {
      ingestWhatsApp({
        jid, phone: numberOf(jid), waId: `DEMO-IN-${Date.now()}-${++this.seq}`, fromMe: false,
        type: 'text', body: AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)], timestamp: Date.now(),
      });
    }, 3000 + Math.random() * 3000);
  }
  async restart() {}
  async logout() {}
  async shutdown() {}
}

export const wa = DEMO ? new DemoProvider() : new BaileysProvider();
