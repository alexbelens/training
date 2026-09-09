import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './db.js';
import { checkForUpdate, CURRENT_VERSION, REPO } from './update-check.js';
import { scheduleBackups, runBackup } from './backup.js';
import { sendMail, MAIL_ENABLED } from './mail.js';
import { validateProgram } from '../shared/constraints.js';
import { suggest, nextDayType, kneeAlarm } from '../shared/progression.js';
import { scheduleAround, missedDays, nextPlanned, adherence, normalizeSchedule, nextTypeInRotation } from '../shared/schedule.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const COACH_TOKEN = process.env.COACH_TOKEN || '';
const INVITE_CODE = process.env.INVITE_CODE || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
// '1' — всегда Secure, '0' — никогда, иначе автоматически: Secure только для https-запросов
const SECURE_COOKIE = process.env.SECURE_COOKIE || 'auto';
const log = (...a) => console.log(new Date().toISOString(), ...a);

if (process.env.DISABLE_BACKUPS !== '1') scheduleBackups(log);
setInterval(() => store.purgeExpired(), 6 * 36e5).unref();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));

// ---------- helpers ----------
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]; }));
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
const safeEq = (a, b) => { const A = Buffer.from(String(a)), B = Buffer.from(String(b)); return A.length === B.length && crypto.timingSafeEqual(A, B); };
const isCoach = (req) => !!COACH_TOKEN && bearer(req).length > 0 && safeEq(bearer(req), COACH_TOKEN);
const isHttps = (req) => req.secure || (req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
const setSessionCookie = (req, res, token) => {
  const secure = SECURE_COOKIE === '1' || (SECURE_COOKIE !== '0' && isHttps(req));
  res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}${secure ? '; Secure' : ''}`);
};
const clearSessionCookie = (res) => res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
const baseUrl = (req) => PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
const registrationOpen = () => store.getSetting('registration_open', true) !== false;
const today = () => new Date().toLocaleDateString('sv-SE'); // локальная дата сервера в формате YYYY-MM-DD

// простой лимитер попыток входа: 10 за 15 минут на ip+login
const attempts = new Map();
const tooMany = (key) => { const now = Date.now(); const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3); attempts.set(key, a); return a.length >= 10; };
const noteAttempt = (key) => attempts.set(key, [...(attempts.get(key) || []), Date.now()]);

const validLogin = (s) => /^[a-zA-Z0-9_.-]{3,32}$/.test(s);
const validPassword = (s) => typeof s === 'string' && s.length >= 8 && s.length <= 200;
const validEmail = (s) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ---------- auth: определяем пользователя ----------
// Обычный пользователь — cookie-сессия. Тренер (Claude Code) — Bearer COACH_TOKEN + заголовок X-User-Id.
app.use('/api', (req, res, next) => {
  req.coach = isCoach(req);
  if (req.coach) {
    const uid = Number(req.get('x-user-id') || req.query.user_id);
    req.user = uid ? store.getUser(uid) : null;
    return next();
  }
  req.user = store.userBySession(cookies(req).session);
  next();
});
const requireUser = (req, res, next) => {
  if (req.user) return next();
  if (req.coach) return req.path.startsWith('/admin') ? next() : res.status(400).json({ error: 'coach: нужен заголовок X-User-Id' });
  res.status(401).json({ error: 'auth_required' });
};
const requireAdmin = (req, res, next) => (req.coach || req.user?.is_admin ? next() : res.status(403).json({ error: 'admin_required' }));
const requireCoach = (req, res, next) => (req.coach ? next() : res.status(403).json({ error: 'coach_token_required' }));

const api = express.Router();
api.get('/health', (req, res) => res.json({ ok: true, version: CURRENT_VERSION }));

// ---------- auth endpoints ----------
api.get('/auth', (req, res) => res.json({
  user: req.user, coach: req.coach,
  registration_open: registrationOpen(), invite_required: !!INVITE_CODE, mail_enabled: MAIL_ENABLED,
  users_count: store.countUsers(), version: CURRENT_VERSION,
}));

api.post('/register', (req, res) => {
  const { login, email, password, invite } = req.body || {};
  if (store.countUsers() > 0 && !registrationOpen()) return res.status(403).json({ error: 'Регистрация закрыта' });
  if (INVITE_CODE && store.countUsers() > 0 && !(invite && safeEq(invite, INVITE_CODE))) return res.status(403).json({ error: 'Неверный код приглашения' });
  if (!validLogin(String(login || ''))) return res.status(400).json({ error: 'Логин: 3–32 символа, латиница/цифры/._-' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Пароль: минимум 8 символов' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Некорректный email' });
  if (store.findUserByLogin(login) || (email && store.findUserByLogin(email))) return res.status(409).json({ error: 'Такой логин или email уже занят' });
  const user = store.createUser({ login, email: email || null, password });
  setSessionCookie(req, res, store.createSession(user.id, req.get('user-agent')));
  log(`register ${user.login}${user.is_admin ? ' (admin)' : ''}`);
  res.json({ user });
});

api.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  const key = `${req.ip}|${String(login || '').toLowerCase()}`;
  if (tooMany(key)) return res.status(429).json({ error: 'Слишком много попыток, подожди 15 минут' });
  const row = store.findUserByLogin(String(login || ''));
  if (!row || !store.verifyPassword(password || '', row.password_hash)) { noteAttempt(key); return res.status(401).json({ error: 'Неверный логин или пароль' }); }
  setSessionCookie(req, res, store.createSession(row.id, req.get('user-agent')));
  res.json({ user: store.getUser(row.id) });
});

api.post('/logout', (req, res) => { store.deleteSession(cookies(req).session); clearSessionCookie(res); res.json({ ok: true }); });

// Восстановление пароля. С SMTP — письмо со ссылкой; без — заявка видна админу, он передаёт ссылку сам.
api.post('/password/forgot', async (req, res) => {
  const row = store.findUserByLogin(String(req.body?.login || ''));
  const generic = { ok: true, mail: MAIL_ENABLED, message: MAIL_ENABLED ? 'Если аккаунт существует, письмо со ссылкой отправлено' : 'Заявка принята: администратор пришлёт тебе ссылку для сброса' };
  if (!row) return res.json(generic);
  const token = store.createResetToken(row.id, 24);
  const link = `${baseUrl(req)}/reset/${token}`;
  if (MAIL_ENABLED && row.email) {
    try { await sendMail({ to: row.email, subject: 'Сброс пароля — Training', text: `Ссылка для сброса пароля (действует 24 часа):\n${link}` }); }
    catch (e) { log('mail error', e.message); }
  } else {
    const pending = store.getSetting('pending_resets', []).filter((x) => x.user_id !== row.id);
    pending.push({ user_id: row.id, login: row.login, link, created_at: new Date().toISOString() });
    store.setSetting('pending_resets', pending);
  }
  res.json(generic);
});
api.post('/password/reset', (req, res) => {
  const { token, password } = req.body || {};
  if (!validPassword(password)) return res.status(400).json({ error: 'Пароль: минимум 8 символов' });
  const user = store.consumeResetToken(token, password);
  if (!user) return res.status(400).json({ error: 'Ссылка недействительна или устарела' });
  log(`password reset: ${user.login}`);
  store.setSetting('pending_resets', store.getSetting('pending_resets', []).filter((x) => x.user_id !== user.id));
  setSessionCookie(req, res, store.createSession(user.id, req.get('user-agent')));
  res.json({ user });
});

// ---------- всё ниже — только для авторизованных ----------
api.use(requireUser);

api.post('/password/change', (req, res) => {
  const { current, password } = req.body || {};
  const row = store.findUserByLogin(req.user.login);
  if (!req.coach && !store.verifyPassword(current || '', row.password_hash)) return res.status(400).json({ error: 'Текущий пароль неверен' });
  if (!validPassword(password)) return res.status(400).json({ error: 'Пароль: минимум 8 символов' });
  store.setPassword(req.user.id, password);
  setSessionCookie(req, res, store.createSession(req.user.id, req.get('user-agent')));
  log(`password changed: ${req.user.login}`);
  res.json({ ok: true });
});
api.put('/account', (req, res) => {
  const { email } = req.body || {};
  if (!validEmail(email)) return res.status(400).json({ error: 'Некорректный email' });
  const other = email ? store.findUserByLogin(email) : null;
  if (other && other.id !== req.user.id) return res.status(409).json({ error: 'Email уже используется' });
  store.db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, req.user.id);
  res.json({ user: store.getUser(req.user.id) });
});

// ---------- state ----------
api.get('/state', (req, res) => {
  const uid = req.user.id;
  const workouts = store.listWorkouts(uid);
  const profile = store.getProfile(uid);
  const program = store.getProgram(uid);
  const now = today();
  res.json({
    version: CURRENT_VERSION,
    user: req.user,
    profile,
    program,
    workouts,
    weights: store.listWeights(uid),
    reports: store.listReports(uid, 10),
    requests: store.listRequests(uid, 'open'),
    today: now,
    next_day: nextTypeInRotation(workouts, profile, program) || nextDayType(workouts),
    schedule: scheduleAround(profile, workouts, program, now, { back: 21, forward: 21 }),
    next_planned: nextPlanned(profile, workouts, program, now),
    missed: missedDays(profile, workouts, program, now, 21),
    adherence: adherence(profile, workouts, program, now),
    knee_alarm: kneeAlarm(workouts),
  });
});
api.get('/version', async (req, res) => res.json(await checkForUpdate({ force: req.query.force === '1' })));

// ---------- profile ----------
api.put('/profile', (req, res) => {
  const patch = { ...(req.body || {}) };
  if ('schedule' in patch) patch.schedule = normalizeSchedule(patch.schedule);
  res.json(store.saveProfile(req.user.id, patch));
});

// ---------- program ----------
api.get('/program', (req, res) => res.json(store.getProgram(req.user.id)));
api.get('/program/history', (req, res) => res.json(store.programHistory(req.user.id)));
api.get('/program/:id', (req, res) => { const p = store.getProgramVersion(req.user.id, Number(req.params.id)); p ? res.json(p) : res.status(404).json({ error: 'not_found' }); });
api.put('/program', (req, res) => {
  const { rationale, author, ...program } = req.body || {};
  const errors = validateProgram(program, store.getProfile(req.user.id));
  if (errors.length) return res.status(400).json({ error: 'invalid_program', errors });
  res.json(store.saveProgram(req.user.id, program, { rationale: rationale || null, author: req.coach ? 'coach' : 'user' }));
});
api.post('/program/rollback/:id', (req, res) => {
  const p = store.getProgramVersion(req.user.id, Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'not_found' });
  res.json(store.saveProgram(req.user.id, { schema: p.schema, days: p.days }, { rationale: `откат к версии ${p.version}`, author: req.coach ? 'coach' : 'user' }));
});

// ---------- suggestions ----------
api.get('/suggest/:day', (req, res) => {
  const uid = req.user.id;
  const program = store.getProgram(uid), profile = store.getProfile(uid), workouts = store.listWorkouts(uid);
  const items = program?.days?.[req.params.day] || [];
  const opts = { adaptation: !!profile.adaptation_period, today: req.query.date || today() };
  res.json(Object.fromEntries(items.map((it) => [it.id, suggest(it, workouts, opts)])));
});

// ---------- workouts ----------
api.get('/workouts', (req, res) => res.json(store.listWorkouts(req.user.id)));
api.post('/workouts', (req, res) => {
  const w = req.body || {};
  if (!w.date || !w.type) return res.status(400).json({ error: 'date и type обязательны' });
  const existing = store.listWorkouts(req.user.id).find((x) => x.date === String(w.date));
  if (existing) return res.status(409).json({ error: 'На эту дату уже есть запись', workout: existing });
  res.json(store.createWorkout(req.user.id, w));
});

// Пропуск тренировки: запись без подходов, очередь типов при этом не сдвигается.
api.post('/skip', (req, res) => {
  const { date, type, reason } = req.body || {};
  if (!date || !type) return res.status(400).json({ error: 'date и type обязательны' });
  const existing = store.listWorkouts(req.user.id).find((x) => x.date === String(date));
  if (existing) {
    return res.json(store.updateWorkout(req.user.id, existing.id, { status: 'skipped', notes: reason || existing.notes, exercises: [] }));
  }
  res.json(store.createWorkout(req.user.id, { date, type, status: 'skipped', notes: reason || null, exercises: [], pain: null }));
});
api.put('/workouts/:id', (req, res) => {
  const w = store.updateWorkout(req.user.id, Number(req.params.id), req.body || {});
  w ? res.json(w) : res.status(404).json({ error: 'not_found' });
});
api.delete('/workouts/:id', (req, res) => res.json({ ok: store.deleteWorkout(req.user.id, Number(req.params.id)) }));

// ---------- weights ----------
api.get('/weights', (req, res) => res.json(store.listWeights(req.user.id)));
api.post('/weights', (req, res) => {
  const { date, kg } = req.body || {};
  if (!date || !(Number(kg) > 0)) return res.status(400).json({ error: 'date и kg обязательны' });
  store.upsertWeight(req.user.id, date, kg); res.json(store.listWeights(req.user.id));
});
api.delete('/weights/:date', (req, res) => { store.deleteWeight(req.user.id, req.params.date); res.json(store.listWeights(req.user.id)); });

// ---------- export / import ----------
api.get('/export', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="training-${req.user.login}-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(store.exportAll(req.user.id));
});
api.post('/import', (req, res) => {
  try { res.json(store.importAll(req.user.id, req.body, { replace: req.query.merge !== '1' })); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// ---------- coach: пользовательская часть ----------
api.get('/coach/reports', (req, res) => res.json(store.listReports(req.user.id, Number(req.query.limit) || 20)));
api.post('/coach/reports/:id/seen', (req, res) => { store.markReportSeen(req.user.id, Number(req.params.id)); res.json({ ok: true }); });
api.get('/coach/requests', (req, res) => res.json(store.listRequests(req.user.id, req.query.status || undefined)));
api.post('/coach/requests', (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text обязателен' });
  res.json(store.addRequest(req.user.id, text));
});
// ---------- coach: тренерская часть (Bearer COACH_TOKEN + X-User-Id) ----------
api.post('/coach/reports', requireCoach, (req, res) => {
  const { kind = 'review', request_id, ...content } = req.body || {};
  if (!content.summary && !content.good && !content.text) return res.status(400).json({ error: 'нужен summary / good / text' });
  const report = store.addReport(req.user.id, kind, content);
  if (request_id) store.closeRequest(req.user.id, Number(request_id), report.id);
  res.json(report);
});
api.post('/coach/requests/:id/close', requireCoach, (req, res) => { store.closeRequest(req.user.id, Number(req.params.id), req.body?.report_id || null); res.json({ ok: true }); });

// ---------- admin ----------
const admin = express.Router();
admin.use(requireAdmin);
admin.get('/overview', (req, res) => {
  const users = store.listUsers().map((u) => {
    const ws = store.listWorkouts(u.id);
    return { ...u, workouts: ws.length, last_workout: ws.at(-1)?.date || null, open_requests: store.listRequests(u.id, 'open').length };
  });
  res.json({ users, registration_open: registrationOpen(), pending_resets: store.getSetting('pending_resets', []), mail_enabled: MAIL_ENABLED, invite_required: !!INVITE_CODE, open_requests: store.listAllOpenRequests() });
});
admin.put('/settings', (req, res) => { if (typeof req.body?.registration_open === 'boolean') store.setSetting('registration_open', req.body.registration_open); res.json({ registration_open: registrationOpen() }); });
admin.post('/users/:id/reset-link', (req, res) => {
  const u = store.getUser(Number(req.params.id)); if (!u) return res.status(404).json({ error: 'not_found' });
  res.json({ link: `${baseUrl(req)}/reset/${store.createResetToken(u.id, 24)}` });
});
admin.post('/users/:id/admin', (req, res) => { store.setAdmin(Number(req.params.id), !!req.body?.is_admin); res.json({ ok: true }); });
admin.delete('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user?.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  res.json({ ok: store.deleteUser(id) });
});
admin.post('/backup', (req, res) => res.json({ file: path.basename(runBackup()) }));
api.use('/admin', admin);

api.use((err, req, res, next) => { log('API error', err); res.status(err.type === 'entity.parse.failed' ? 400 : 500).json({ error: String(err.message || err) }); });
app.use('/api', api);

// ---------- static ----------
const dist = path.resolve(__dirname, '..', 'dist', 'web');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
} else {
  app.get('/', (req, res) => res.type('text').send('Фронтенд не собран: npm run build. API: /api/health'));
}

app.listen(PORT, () => {
  log(`training v${CURRENT_VERSION} на http://0.0.0.0:${PORT}  data=${store.DATA_DIR}  repo=${REPO}  users=${store.countUsers()}  coach_token=${COACH_TOKEN ? 'да' : 'нет'}  mail=${MAIL_ENABLED ? 'да' : 'нет'}`);
});
