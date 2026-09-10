import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { ToastProvider } from './components/ui.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import Auth from './pages/Auth.jsx';
import Workout from './pages/Workout.jsx';
import Program from './pages/Program.jsx';
import Progress from './pages/Progress.jsx';
import Coach from './pages/Coach.jsx';
import Gyms from './pages/Gyms.jsx';
import Settings from './pages/Settings.jsx';

const TABS = [
  { id: 'workout', label: 'Тренировка', ic: '🏋️' },
  { id: 'program', label: 'Программа', ic: '📋' },
  { id: 'progress', label: 'Прогресс', ic: '📈' },
  { id: 'gyms', label: 'Залы', ic: '🏟' },
  { id: 'coach', label: 'Тренер', ic: '🧠' },
  { id: 'settings', label: 'Настройки', ic: '⚙️' },
];

/** Переключатель активного зала: от него зависит, чьи тренажёры и фото видно в программе и тренировке. */
function GymSwitch({ state, reload }) {
  const gyms = state.gyms || [];
  if (gyms.length < 2) return null;
  return (
    <select
      className="gym-switch"
      value={state.active_gym_id ?? ''}
      onChange={async (e) => { await api.post(`/api/gyms/${e.target.value}/active`); await reload(); }}
    >
      {gyms.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
  );
}

export default function App() {
  const [info, setInfo] = useState(null);
  const [state, setState] = useState(null);
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('tab') || 'workout'; } catch { return 'workout'; } });
  const resetMatch = window.location.pathname.match(/^\/reset\/([A-Za-z0-9_-]+)/);
  const [authMode, setAuthMode] = useState(resetMatch ? 'reset' : 'login');
  const [err, setErr] = useState('');

  const loadInfo = useCallback(() => api.get('/api/auth').then(setInfo).catch((e) => setErr(e.message)), []);
  const reload = useCallback(async () => { try { setState(await api.get('/api/state')); } catch (e) { if (e.status === 401) { setState(null); loadInfo(); } else setErr(e.message); } }, [loadInfo]);

  useEffect(() => { loadInfo(); }, [loadInfo]);
  useEffect(() => { if (info?.user) reload(); }, [info?.user?.id, reload]);
  useEffect(() => { try { localStorage.setItem('tab', tab); } catch {} }, [tab]);

  function onAuthed(user) {
    if (resetMatch) window.history.replaceState(null, '', '/');
    setInfo((i) => ({ ...i, user }));
    if (info?.users_count === 0 || !user) setTab('settings');
  }
  async function logout() { await api.post('/api/logout'); setState(null); setInfo((i) => ({ ...i, user: null })); setAuthMode('login'); }

  if (err && !info) return <div className="app"><div className="card bad">Сервер недоступен: {err}</div></div>;
  if (!info) return <div className="app muted">Загрузка…</div>;
  if (!info.user) return <ToastProvider><Auth info={info} onAuthed={onAuthed} mode={authMode} setMode={setAuthMode} resetToken={resetMatch?.[1]} /></ToastProvider>;
  if (!state) return <div className="app muted">Загрузка…</div>;

  const unread = state.reports.filter((r) => !r.seen).length;
  const Page = { workout: Workout, program: Program, progress: Progress, gyms: Gyms, coach: Coach, settings: Settings }[tab];

  return (
    <ToastProvider>
      <div className="shell">
      <nav className="nav">
        <div className="nav-brand brand">Training</div>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); window.scrollTo(0, 0); }}>
            <span className="ic">{t.ic}</span><span className="lbl">{t.label}</span>
            {t.id === 'coach' && unread > 0 && <span className="badge">{unread}</span>}
          </button>
        ))}
        <div className="nav-user small muted">{state.profile.name || state.user.login}</div>
      </nav>
      <div className="app">
        <div className="topbar">
          <span className="brand">Training</span>
          <div className="row">
            <GymSwitch state={state} reload={reload} />
            <span className="small muted">{state.profile.name || state.user.login}</span>
          </div>
        </div>
        <UpdateBanner />
        {!state.profile.onboarded && tab !== 'settings' && (
          <div className="banner info"><span className="small">Заполни профиль, чтобы тренер знал твои ограничения.</span><button className="btn-sm" onClick={() => setTab('settings')}>Профиль</button></div>
        )}
        <main className={'page page-' + tab}><Page state={state} reload={reload} onLogout={logout} setTab={setTab} /></main>
      </div>
      </div>
    </ToastProvider>
  );
}
