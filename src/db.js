import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_FILE = path.join(DATA_DIR, 'crm.db');
export const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','agent')),
  color         TEXT NOT NULL DEFAULT '#0ea5e9',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jid        TEXT NOT NULL UNIQUE,
  phone      TEXT,
  name       TEXT,
  push_name  TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id      INTEGER NOT NULL UNIQUE REFERENCES contacts(id),
  assigned_to     INTEGER REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  unread          INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER,
  last_preview    TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_assigned ON conversations(assigned_to, status);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  wa_id           TEXT,
  direction       TEXT NOT NULL CHECK (direction IN ('in','out','internal')),
  type            TEXT NOT NULL DEFAULT 'text',
  body            TEXT,
  media_mime      TEXT,
  media_name      TEXT,
  media_size      INTEGER,
  status          TEXT,
  sender_user_id  INTEGER REFERENCES users(id),
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_waid ON messages(wa_id) WHERE wa_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS media_blobs (
  message_id INTEGER PRIMARY KEY REFERENCES messages(id),
  data       BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS transfers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  from_user_id    INTEGER REFERENCES users(id),
  to_user_id      INTEGER REFERENCES users(id),
  by_user_id      INTEGER NOT NULL REFERENCES users(id),
  note            TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfers_conv ON transfers(conversation_id, id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_no_delete_messages BEFORE DELETE ON messages
BEGIN SELECT RAISE(ABORT, 'Mensagens nao podem ser apagadas'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_media BEFORE DELETE ON media_blobs
BEGIN SELECT RAISE(ABORT, 'Midias nao podem ser apagadas'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_transfers BEFORE DELETE ON transfers
BEGIN SELECT RAISE(ABORT, 'Historico de transferencias nao pode ser apagado'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_conversations BEFORE DELETE ON conversations
BEGIN SELECT RAISE(ABORT, 'Conversas nao podem ser apagadas'); END;
`);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
