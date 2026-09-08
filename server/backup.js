import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, backupTo } from './db.js';

const KEEP = Number(process.env.BACKUP_KEEP || 14);
const DIR = path.join(DATA_DIR, 'backups');

export function runBackup() {
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(DIR, `training-${stamp}.db`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  backupTo(file);
  const files = fs.readdirSync(DIR).filter((f) => f.startsWith('training-') && f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(DIR, f));
  return file;
}

/** Ежедневный бэкап в 03:30 локального времени контейнера + один сразу при старте. */
export function scheduleBackups(log = console.log) {
  const tick = () => { try { log(`[backup] ${runBackup()}`); } catch (e) { log(`[backup] ошибка: ${e.message}`); } };
  tick();
  const msUntilNext = () => { const n = new Date(); const t = new Date(n); t.setHours(3, 30, 0, 0); if (t <= n) t.setDate(t.getDate() + 1); return t - n; };
  const arm = () => setTimeout(() => { tick(); arm(); }, msUntilNext());
  arm();
}
