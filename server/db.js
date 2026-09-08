import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PROGRAM, DEFAULT_PROFILE } from '../shared/default-program.js';

export const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, 'training.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  profile TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  expires_at TEXT NOT NULL,
  ua TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  rationale TEXT,
  author TEXT NOT NULL DEFAULT 'user',
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS programs_user ON programs(user_id, active);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  exercises TEXT NOT NULL,
  pain INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW}),
  UNIQUE(user_id, client_id)
);
CREATE INDEX IF NOT EXISTS workouts_user_date ON workouts(user_id, date);
CREATE TABLE IF NOT EXISTS weights (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL, kg REAL NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS coach_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'review',
  content TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS coach_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  answer_report_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  closed_at TEXT
);
`);

const j = (v) => JSON.stringify(v);
const p = (s, fallback = null) => { try { return s == null ? fallback : JSON.parse(s); } catch { return fallback; } };
const iso = (d) => new Date(d).toISOString();
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------- settings ----------
export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? p(row.value, fallback) : fallback;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, j(value));
}

// ---------- users / passwords ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
export function verifyPassword(password, stored) {
  try {
    const [, salt, hash] = String(stored).split('$');
    const calc = crypto.scryptSync(String(password), Buffer.from(salt, 'base64url'), 64, { N: 16384, r: 8, p: 1 });
    const h = Buffer.from(hash, 'base64url');
    return h.length === calc.length && crypto.timingSafeEqual(h, calc);
  } catch { return false; }
}
const rowToUser = (r) => r && ({ id: r.id, login: r.login, email: r.email, is_admin: !!r.is_admin, created_at: r.created_at });
export function countUsers() { return db.prepare('SELECT COUNT(*) AS n FROM users').get().n; }
export function listUsers() { return db.prepare('SELECT * FROM users ORDER BY id').all().map(rowToUser); }
export function getUser(id) { return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)); }
export function findUserByLogin(login) { return db.prepare('SELECT * FROM users WHERE login = ? OR (email IS NOT NULL AND email = ?)').get(login, login); }
export function createUser({ login, email, password }) {
  const isAdmin = countUsers() === 0 ? 1 : 0; // первый зарегистрированный — админ
  const info = db.prepare('INSERT INTO users(login, email, password_hash, is_admin, profile) VALUES(?, ?, ?, ?, ?)')
    .run(login, email || null, hashPassword(password), isAdmin, j({}));
  const id = Number(info.lastInsertRowid);
  saveProgram(id, { schema: DEFAULT_PROGRAM.schema, days: DEFAULT_PROGRAM.days }, { rationale: 'стартовая программа-шаблон', author: 'system' });
  return getUser(id);
}
export function setPassword(userId, password) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
export function setAdmin(userId, flag) { db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(flag ? 1 : 0, userId); }
export function deleteUser(userId) { return db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes > 0; }

// ---------- sessions ----------
const SESSION_DAYS = 365;
export function createSession(userId, ua) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at, ua) VALUES(?, ?, ?, ?)')
    .run(sha(token), userId, iso(Date.now() + SESSION_DAYS * 864e5), ua?.slice(0, 200) || null);
  return token;
}
export function userBySession(token) {
  if (!token) return null;
  const r = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ${NOW}`).get(sha(token));
  return rowToUser(r);
}
export function deleteSession(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)); }
export function purgeExpired() {
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ${NOW}`).run();
  db.prepare(`DELETE FROM password_resets WHERE expires_at <= ${NOW} OR used = 1`).run();
}

// ---------- password reset ----------
export function createResetToken(userId, hours = 24) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES(?, ?, ?)').run(sha(token), userId, iso(Date.now() + hours * 36e5));
  return token;
}
export function consumeResetToken(token, newPassword) {
  const r = db.prepare(`SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > ${NOW}`).get(sha(token || ''));
  if (!r) return null;
  db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(r.token_hash);
  setPassword(r.user_id, newPassword);
  return getUser(r.user_id);
}

// ---------- profile ----------
export function getProfile(userId) {
  const r = db.prepare('SELECT profile FROM users WHERE id = ?').get(userId);
  return { ...DEFAULT_PROFILE, ...(p(r?.profile, {}) || {}) };
}
export function saveProfile(userId, patch) {
  const next = { ...getProfile(userId), ...patch };
  if (!Array.isArray(next.forbidden)) next.forbidden = [];
  db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(j(next), userId);
  return next;
}

// ---------- program ----------
const rowToProgram = (row) => row && ({ ...p(row.data), version: row.version, id: row.id, rationale: row.rationale, author: row.author, created_at: row.created_at });
export function getProgram(userId) {
  return rowToProgram(db.prepare('SELECT * FROM programs WHERE user_id = ? AND active = 1 ORDER BY id DESC LIMIT 1').get(userId));
}
export function programHistory(userId) {
  return db.prepare('SELECT id, version, rationale, author, active, created_at FROM programs WHERE user_id = ? ORDER BY version DESC').all(userId);
}
export function getProgramVersion(userId, id) {
  return rowToProgram(db.prepare('SELECT * FROM programs WHERE user_id = ? AND id = ?').get(userId, id));
}
export function saveProgram(userId, program, { rationale = null, author = 'user' } = {}) {
  const cur = db.prepare('SELECT MAX(version) AS v FROM programs WHERE user_id = ?').get(userId);
  const version = (cur?.v || 0) + 1;
  const { id, version: _v, rationale: _r, author: _a, created_at: _c, ...data } = program;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE programs SET active = 0 WHERE user_id = ?').run(userId);
    db.prepare('INSERT INTO programs(user_id, version, data, rationale, author, active) VALUES(?, ?, ?, ?, ?, 1)').run(userId, version, j({ ...data, version }), rationale, author);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return getProgram(userId);
}

// ---------- workouts ----------
const rowToWorkout = (r) => ({ id: r.id, date: r.date, type: r.type, exercises: p(r.exercises, []), pain: r.pain, notes: r.notes, created_at: r.created_at, updated_at: r.updated_at });
export function listWorkouts(userId) {
  return db.prepare('SELECT * FROM workouts WHERE user_id = ? ORDER BY date ASC, id ASC').all(userId).map(rowToWorkout);
}
export function getWorkout(userId, id) {
  const r = db.prepare('SELECT * FROM workouts WHERE user_id = ? AND id = ?').get(userId, id);
  return r ? rowToWorkout(r) : null;
}
export function createWorkout(userId, w) {
  const pain = w.pain == null || w.pain === '' ? null : Number(w.pain);
  const info = db.prepare('INSERT INTO workouts(user_id, client_id, date, type, exercises, pain, notes) VALUES(?, ?, ?, ?, ?, ?, ?)')
    .run(userId, w.client_id ? Number(w.client_id) : null, String(w.date), String(w.type), j(w.exercises || []), pain, w.notes ?? null);
  return getWorkout(userId, Number(info.lastInsertRowid));
}
export function updateWorkout(userId, id, w) {
  const cur = getWorkout(userId, id);
  if (!cur) return null;
  const next = { ...cur, ...w };
  const pain = next.pain == null || next.pain === '' ? null : Number(next.pain);
  db.prepare(`UPDATE workouts SET date = ?, type = ?, exercises = ?, pain = ?, notes = ?, updated_at = ${NOW} WHERE user_id = ? AND id = ?`)
    .run(String(next.date), String(next.type), j(next.exercises || []), pain, next.notes ?? null, userId, id);
  return getWorkout(userId, id);
}
export function deleteWorkout(userId, id) {
  return db.prepare('DELETE FROM workouts WHERE user_id = ? AND id = ?').run(userId, id).changes > 0;
}

// ---------- weights ----------
export function listWeights(userId) { return db.prepare('SELECT date, kg FROM weights WHERE user_id = ? ORDER BY date ASC').all(userId); }
export function upsertWeight(userId, date, kg) {
  db.prepare('INSERT INTO weights(user_id, date, kg) VALUES(?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET kg = excluded.kg').run(userId, String(date), Number(kg));
}
export function deleteWeight(userId, date) { return db.prepare('DELETE FROM weights WHERE user_id = ? AND date = ?').run(userId, String(date)).changes > 0; }

// ---------- coach ----------
const rowToReport = (r) => ({ id: r.id, kind: r.kind, seen: !!r.seen, created_at: r.created_at, ...p(r.content, {}) });
export function listReports(userId, limit = 20) {
  return db.prepare('SELECT * FROM coach_reports WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit).map(rowToReport);
}
export function addReport(userId, kind, content) {
  const info = db.prepare('INSERT INTO coach_reports(user_id, kind, content) VALUES(?, ?, ?)').run(userId, kind, j(content));
  return rowToReport(db.prepare('SELECT * FROM coach_reports WHERE id = ?').get(info.lastInsertRowid));
}
export function markReportSeen(userId, id) { db.prepare('UPDATE coach_reports SET seen = 1 WHERE user_id = ? AND id = ?').run(userId, id); }
export function listRequests(userId, status) {
  return status
    ? db.prepare('SELECT * FROM coach_requests WHERE user_id = ? AND status = ? ORDER BY id DESC').all(userId, status)
    : db.prepare('SELECT * FROM coach_requests WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId);
}
export function listAllOpenRequests() {
  return db.prepare(`SELECT r.*, u.login FROM coach_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'open' ORDER BY r.id`).all();
}
export function addRequest(userId, text) {
  const info = db.prepare('INSERT INTO coach_requests(user_id, text) VALUES(?, ?)').run(userId, text);
  return db.prepare('SELECT * FROM coach_requests WHERE id = ?').get(info.lastInsertRowid);
}
export function closeRequest(userId, id, reportId = null) {
  db.prepare(`UPDATE coach_requests SET status = 'closed', answer_report_id = ?, closed_at = ${NOW} WHERE user_id = ? AND id = ?`).run(reportId, userId, id);
}

// ---------- export / import (формат раздела 6 спеки) ----------
export function exportAll(userId) {
  const program = getProgram(userId);
  return {
    exported_at: new Date().toISOString(),
    user: getUser(userId)?.login,
    profile: getProfile(userId),
    program: program ? { version: program.version, schema: program.schema, days: program.days } : null,
    workouts: listWorkouts(userId).map(({ created_at, updated_at, ...w }) => w),
    weights: listWeights(userId),
    coach_reports: listReports(userId, 50),
    coach_requests: listRequests(userId),
  };
}
export function importAll(userId, data, { replace = true } = {}) {
  if (!data || typeof data !== 'object') throw new Error('Ожидался JSON-объект');
  db.exec('BEGIN');
  try {
    if (replace) {
      db.prepare('DELETE FROM workouts WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM weights WHERE user_id = ?').run(userId);
    }
    if (data.profile) saveProfile(userId, data.profile);
    if (data.program?.days) saveProgram(userId, { schema: data.program.schema, days: data.program.days }, { rationale: 'импорт', author: 'import' });
    for (const w of data.workouts || []) {
      const clientId = w.id ? Number(w.id) : null;
      const existing = clientId ? db.prepare('SELECT id FROM workouts WHERE user_id = ? AND client_id = ?').get(userId, clientId) : null;
      if (existing) updateWorkout(userId, existing.id, w); else createWorkout(userId, { ...w, client_id: clientId });
    }
    for (const wt of data.weights || []) upsertWeight(userId, wt.date, wt.kg);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return exportAll(userId);
}

/** Бэкап через VACUUM INTO — консистентная копия даже при WAL. */
export function backupTo(filePath) { db.prepare('VACUUM INTO ?').run(filePath); }
