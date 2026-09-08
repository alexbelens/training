// Проверка обновлений: сравниваем версию из package.json с последним релизом на GitHub.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
export const CURRENT_VERSION = process.env.APP_VERSION || pkg.version;
export const REPO = process.env.GITHUB_REPO || (pkg.repository?.url || '').replace(/^.*github\.com\//, '').replace(/\.git$/, '') || 'alexbelens/training';

const TTL_MS = Number(process.env.UPDATE_CHECK_TTL_MS || 6 * 60 * 60 * 1000);
let cache = { at: 0, data: null };

export function parseVersion(v) {
  const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function isNewer(latest, current) {
  const a = parseVersion(latest), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

export async function checkForUpdate({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < TTL_MS) return cache.data;
  const base = { current: CURRENT_VERSION, repo: REPO, checked_at: new Date(now).toISOString(), update_available: false };
  if (process.env.DISABLE_UPDATE_CHECK === '1') return { ...base, disabled: true };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `training/${CURRENT_VERSION}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.status === 404) { cache = { at: now, data: { ...base, latest: null, note: 'релизов пока нет' } }; return cache.data; }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const rel = await res.json();
    const latest = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
    cache = { at: now, data: { ...base, latest, update_available: isNewer(latest, CURRENT_VERSION), url: rel.html_url, notes: rel.body || '', published_at: rel.published_at } };
    return cache.data;
  } catch (e) {
    const data = { ...base, error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
    cache = { at: now - TTL_MS + 10 * 60 * 1000, data }; // при ошибке — повтор через 10 минут
    return data;
  }
}
