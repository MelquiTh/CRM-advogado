import path from 'node:path';

export const DEMO = process.argv.includes('--demo') || process.env.WA_MODE === 'demo';
export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const DATA_DIR = path.resolve(process.env.DATA_DIR || (DEMO ? './data-demo' : './data'));
export const MAX_AGENTS = Number(process.env.MAX_AGENTS || 5);
export const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
export const SESSION_DAYS = 14;
