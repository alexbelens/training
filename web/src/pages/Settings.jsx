import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { DOW_SHORT, normalizeSchedule } from '@shared/schedule.js';
import { Field, Confirm, fmtDate, useToast } from '../components/ui.jsx';

export default function Settings({ state, reload, onLogout }) {
  const toast = useToast();
  const { profile, user, version } = state;
  const [p, setP] = useState(profile);
  const [forbidden, setForbidden] = useState((profile.forbidden || []).join('\n'));
  const [pw, setPw] = useState({ current: '', password: '', repeat: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwErr, setPwErr] = useState('');
  const [email, setEmail] = useState(user.email || '');
  const [ver, setVer] = useState(null);
  const fileRef = useRef();
  useEffect(() => { api.get('/api/version').then(setVer).catch(() => {}); }, []);

  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const num = (k) => (e) => setP({ ...p, [k]: e.target.value === '' ? null : Number(e.target.value) });

  async function saveProfile() {
    await api.put('/api/profile', { ...p, forbidden: forbidden.split('\n').map((s) => s.trim()).filter(Boolean), onboarded: true });
    toast('Профиль сохранён'); await reload();
  }
  async function changePw() {
    setPwErr('');
    if (pw.password !== pw.repeat) { setPwErr('Пароли не совпадают'); return; }
    try {
      await api.post('/api/password/change', { current: pw.current, password: pw.password });
      toast('Пароль изменён, вход обновлён');
      setPw({ current: '', password: '', repeat: '' });
    } catch (e) { setPwErr(e.message); toast(e.message); }
  }
  async function saveEmail() { try { await api.put('/api/account', { email }); toast('Email сохранён'); await reload(); } catch (e) { toast(e.message); } }
  async function importFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); await api.post('/api/import', data); toast('Импорт выполнен'); await reload(); }
    catch (err) { toast('Ошибка импорта: ' + err.message); }
    e.target.value = '';
  }

  return (
    <div className="cols2 settings">
      <div className="card stack">
        <h2>Профиль</h2>
        {!profile.onboarded && <p className="small accent">Заполни профиль: рост, вес, цель и ограничения. Это видит тренер при разборе.</p>}
        <Field label="Как к тебе обращаться"><input value={p.name || ''} onChange={set('name')} /></Field>
        <div className="row">
          <Field label="Рост, см"><input type="number" inputMode="numeric" value={p.height_cm ?? ''} onChange={num('height_cm')} /></Field>
          <Field label="Старт. вес"><input type="number" inputMode="decimal" step="0.1" value={p.start_weight_kg ?? ''} onChange={num('start_weight_kg')} /></Field>
          <Field label="Цель, кг"><input type="number" inputMode="decimal" step="0.1" value={p.target_weight_kg ?? ''} onChange={num('target_weight_kg')} /></Field>
        </div>
        <div className="row">
          <Field label="Начало тренировок"><input type="date" value={p.started_at || ''} onChange={set('started_at')} /></Field>
          <Field label="Зал / оборудование"><input value={p.gym_equipment || ''} onChange={set('gym_equipment')} placeholder="Matrix" /></Field>
        </div>
        <Field label="Цели"><textarea value={p.goals || ''} onChange={set('goals')} placeholder="снижение веса, форма, укрепить колено…" /></Field>
        <Field label="Здоровье / травмы (что должен знать тренер)"><textarea value={p.knee || ''} onChange={set('knee')} placeholder="колено: нестабильность надколенника, МРТ не сделано…" /></Field>
        <Field label="Ограничения и правила"><textarea value={p.restrictions || ''} onChange={set('restrictions')} placeholder="разгибание ног — только верхняя треть амплитуды…" /></Field>
        <Field label="Чего не предлагать (отказался)"><textarea value={p.refused || ''} onChange={set('refused')} placeholder="hip thrust, скручивания…" /></Field>
        <Field label="Запрещённые упражнения — по одному в строке (валидатор не даст добавить их в программу)"><textarea value={forbidden} onChange={(e) => setForbidden(e.target.value)} /></Field>
        <label className="check"><input type="checkbox" checked={!!p.adaptation_period} onChange={set('adaptation_period')} />Адаптационный период (2 рабочих подхода вместо 3)</label>
        <label className="check"><input type="checkbox" checked={!!p.doctor_reminder} onChange={set('doctor_reminder')} />Напоминать про врача / МРТ</label>
        <button className="btn-primary btn-block" onClick={saveProfile}>Сохранить профиль</button>
      </div>

      <div className="col">
      <ScheduleCard profile={profile} program={state.program} reload={reload} toast={toast} />

      <div className="card stack">
        <h2>Аккаунт · {user.login} {user.is_admin && <span className="chip accent">админ</span>}</h2>
        <div className="row"><Field label="Email для восстановления"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><button style={{ alignSelf: 'flex-end' }} onClick={saveEmail}>Сохранить</button></div>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); changePw(); }}>
          <input type="text" name="username" autoComplete="username" value={user.login} readOnly hidden />
          <Field label="Текущий пароль">
            <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <div className="row">
            <Field label="Новый пароль (минимум 8)">
              <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
            </Field>
            <Field label="Ещё раз">
              <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} />
            </Field>
          </div>
          <div className="row between">
            <label className="check tiny"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />показать пароль</label>
            <button className="btn-sm" disabled={!pw.current || pw.password.length < 8 || pw.password !== pw.repeat}>Сменить пароль</button>
          </div>
          {pw.password && pw.repeat && pw.password !== pw.repeat && <div className="err tiny">Пароли не совпадают</div>}
          {pwErr && <div className="err tiny">{pwErr}</div>}
        </form>
        <button className="btn-ghost" onClick={onLogout}>Выйти</button>
      </div>

      <div className="card stack">
        <h2>Данные</h2>
        <div className="row">
          <a className="btn grow" href="/api/export" download>Экспорт JSON</a>
          <button className="grow" onClick={() => fileRef.current.click()}>Импорт JSON</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importFile} />
        </div>
        <p className="tiny muted">Импорт заменяет тренировки и веса, программа сохраняется как новая версия. Бэкап базы делается автоматически каждую ночь.</p>
      </div>

      {user.is_admin && <Admin toast={toast} />}

      <div className="card small muted">
        <div className="row between"><span>Версия {version}</span>{ver?.latest && <span>последний релиз {ver.latest}</span>}</div>
        {ver?.update_available && <div className="accent" style={{ marginTop: 4 }}>Доступно обновление: <a href={ver.url} target="_blank" rel="noreferrer">{ver.latest}</a>. На сервере: <code>./update.sh</code></div>}
        {ver?.error && <div className="tiny">Проверка обновлений: {ver.error}</div>}
        <div className="tiny" style={{ marginTop: 4 }}><a href={`https://github.com/${ver?.repo || 'alexbelens/training'}`} target="_blank" rel="noreferrer">github.com/{ver?.repo || 'alexbelens/training'}</a></div>
      </div>
      </div>
    </div>
  );
}

function ScheduleCard({ profile, program, reload, toast }) {
  const types = Object.keys(program?.days || { A: [], B: [] });
  const [sch, setSch] = useState(normalizeSchedule(profile.schedule));
  const [busy, setBusy] = useState(false);
  const byDow = Object.fromEntries(sch.map((s) => [s.dow, s.type]));

  function toggle(dow) {
    if (byDow[dow]) return setSch(sch.filter((s) => s.dow !== dow));
    // новый день получает следующий тип по чередованию
    const order = types.filter((t) => t !== 'C');
    const prev = [...sch].sort((a, b) => a.dow - b.dow).filter((s) => s.dow < dow).pop() || [...sch].sort((a, b) => b.dow - a.dow)[0];
    const next = prev ? order[(order.indexOf(prev.type) + 1) % order.length] : order[0];
    setSch(normalizeSchedule([...sch, { dow, type: next || 'A' }]));
  }
  const setType = (dow, type) => setSch(sch.map((s) => (s.dow === dow ? { ...s, type } : s)));

  async function save() {
    setBusy(true);
    try { await api.put('/api/profile', { schedule: sch }); toast('Расписание сохранено'); await reload(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card stack">
      <div className="row between">
        <h2>Расписание</h2>
        <span className="chip accent">{sch.length ? `${sch.length} ${plural(sch.length)} в неделю` : 'не задано'}</span>
      </div>
      <p className="small muted">Отметь дни, в которые ходишь в зал, и выбери, что делаешь в каждый из них. Пропуски можно отмечать на главном экране, они учитываются в рекомендациях весов.</p>
      <div className="dows">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <button key={d} type="button" className={byDow[d] ? 'active' : ''} onClick={() => toggle(d)}>{DOW_SHORT[d]}</button>
        ))}
      </div>
      {sch.length > 0 && (
        <div className="stack">
          {sch.map((s) => (
            <div key={s.dow} className="row between">
              <span className="small">{DOW_SHORT[s.dow]}</span>
              <select style={{ maxWidth: 220 }} value={s.type} onChange={(e) => setType(s.dow, e.target.value)}>
                {types.map((t) => <option key={t} value={t}>Тренировка {t}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <button className="btn-primary btn-block" disabled={busy} onClick={save}>Сохранить расписание</button>
    </div>
  );
}

const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'тренировка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'тренировки' : 'тренировок');

function Admin({ toast }) {
  const [ov, setOv] = useState(null);
  const load = () => api.get('/api/admin/overview').then(setOv).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);
  if (!ov) return null;
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Скопировано'); } catch { prompt('Скопируй ссылку:', t); } };
  return (
    <div className="card stack">
      <h2>Администрирование</h2>
      <label className="check"><input type="checkbox" checked={ov.registration_open} onChange={async (e) => { await api.put('/api/admin/settings', { registration_open: e.target.checked }); load(); }} />Регистрация открыта{ov.invite_required ? ' (нужен код приглашения)' : ''}</label>
      {ov.pending_resets.length > 0 && (
        <div className="card sub">
          <div className="small"><b>Запросы на сброс пароля</b> — передай ссылку человеку лично:</div>
          {ov.pending_resets.map((r) => <div key={r.user_id} className="list-item small"><span>{r.login} · {fmtDate(r.created_at)}</span><button className="btn-sm" onClick={() => copy(r.link)}>ссылка</button></div>)}
        </div>
      )}
      <table className="table">
        <thead><tr><th>Пользователь</th><th>Трен.</th><th>Последняя</th><th /></tr></thead>
        <tbody>{ov.users.map((u) => (
          <tr key={u.id}>
            <td>{u.login}{u.is_admin ? ' ★' : ''}{u.open_requests ? <span className="chip accent" style={{ marginLeft: 4 }}>{u.open_requests} запр.</span> : null}<div className="tiny muted">{u.email || 'без email'}</div></td>
            <td>{u.workouts}</td><td>{u.last_workout ? fmtDate(u.last_workout) : '—'}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="btn-sm btn-ghost" title="ссылка для сброса пароля" onClick={async () => { const r = await api.post(`/api/admin/users/${u.id}/reset-link`); copy(r.link); }}>🔑</button>
              {!u.is_admin && <Confirm className="btn-sm btn-ghost" onYes={async () => { await api.del(`/api/admin/users/${u.id}`); load(); }}>🗑</Confirm>}
            </td>
          </tr>
        ))}</tbody>
      </table>
      <button className="btn-sm btn-ghost" onClick={async () => { const r = await api.post('/api/admin/backup'); toast('Бэкап: ' + r.file); }}>Сделать бэкап сейчас</button>
    </div>
  );
}
