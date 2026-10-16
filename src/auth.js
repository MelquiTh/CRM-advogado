import crypto from 'node:crypto';
import { db } from './db.js';
import { SESSION_DAYS, COOKIE_SECURE } from './config.js';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [alg, s, h] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const hh = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
    return crypto.timingSafeEqual(hh, Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
}

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run(sha(token), userId, now, now + SESSION_DAYS * 864e5);
  return token;
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));
}

export function destroyUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}

export function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.color, u.active, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(sha(token));
  if (!row || !row.active || row.expires_at < Date.now()) return null;
  const { expires_at, ...user } = row;
  return user;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, clear = false) {
  const maxAge = clear ? 0 : SESSION_DAYS * 86400;
  return `sid=${clear ? '' : token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${COOKIE_SECURE ? '; Secure' : ''}`;
}
