import React, { useState } from 'react';
import { api } from '../api.js';
import { Field } from '../components/ui.jsx';

export default function Auth({ info, onAuthed, mode, setMode, resetToken }) {
  const [f, setF] = useState({ login: '', email: '', password: '', password2: '', invite: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const firstUser = info?.users_count === 0;

  async function submit(e) {
    e.preventDefault(); setErr(''); setMsg(''); setBusy(true);
    try {
      if (mode === 'login') { const r = await api.post('/api/login', { login: f.login.trim(), password: f.password }); onAuthed(r.user); }
      else if (mode === 'register') {
        if (f.password !== f.password2) throw new Error('Пароли не совпадают');
        const r = await api.post('/api/register', { login: f.login.trim(), email: f.email.trim() || undefined, password: f.password, invite: f.invite || undefined });
        onAuthed(r.user);
      } else if (mode === 'forgot') { const r = await api.post('/api/password/forgot', { login: f.login.trim() }); setMsg(r.message); }
      else if (mode === 'reset') {
        if (f.password !== f.password2) throw new Error('Пароли не совпадают');
        const r = await api.post('/api/password/reset', { token: resetToken, password: f.password }); onAuthed(r.user);
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <span className="brand">Training</span>
      <form className="card stack" onSubmit={submit}>
        {mode === 'login' && <>
          <h2>Вход</h2>
          <Field label="Логин или email"><input autoFocus autoCapitalize="none" value={f.login} onChange={set('login')} /></Field>
          <Field label="Пароль"><input type="password" autoComplete="current-password" value={f.password} onChange={set('password')} /></Field>
          {err && <div className="err">{err}</div>}
          <button className="btn-primary btn-block" disabled={busy}>Войти</button>
          <div className="row between small">
            {info?.registration_open || firstUser ? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setErr(''); }}>Регистрация</a> : <span />}
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); setErr(''); }}>Забыл пароль</a>
          </div>
        </>}
        {mode === 'register' && <>
          <h2>{firstUser ? 'Первый пользователь' : 'Регистрация'}</h2>
          {firstUser && <p className="small muted">Первый аккаунт становится администратором.</p>}
          <Field label="Логин (латиница, 3–32)"><input autoFocus autoCapitalize="none" value={f.login} onChange={set('login')} /></Field>
          <Field label="Email (для восстановления пароля, необязательно)"><input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Пароль (минимум 8)"><input type="password" value={f.password} onChange={set('password')} /></Field>
          <Field label="Пароль ещё раз"><input type="password" value={f.password2} onChange={set('password2')} /></Field>
          {info?.invite_required && !firstUser && <Field label="Код приглашения"><input value={f.invite} onChange={set('invite')} /></Field>}
          {err && <div className="err">{err}</div>}
          <button className="btn-primary btn-block" disabled={busy}>Создать аккаунт</button>
          <a href="#" className="small" onClick={(e) => { e.preventDefault(); setMode('login'); setErr(''); }}>Уже есть аккаунт — войти</a>
        </>}
        {mode === 'forgot' && <>
          <h2>Восстановление</h2>
          <p className="small muted">{info?.mail_enabled ? 'Пришлём ссылку на email.' : 'Почта не настроена: заявка попадёт администратору, он пришлёт ссылку для сброса.'}</p>
          <Field label="Логин или email"><input autoFocus autoCapitalize="none" value={f.login} onChange={set('login')} /></Field>
          {err && <div className="err">{err}</div>}
          {msg && <div className="ok small">{msg}</div>}
          <button className="btn-primary btn-block" disabled={busy}>Отправить</button>
          <a href="#" className="small" onClick={(e) => { e.preventDefault(); setMode('login'); setErr(''); }}>Назад ко входу</a>
        </>}
        {mode === 'reset' && <>
          <h2>Новый пароль</h2>
          <Field label="Пароль (минимум 8)"><input autoFocus type="password" value={f.password} onChange={set('password')} /></Field>
          <Field label="Пароль ещё раз"><input type="password" value={f.password2} onChange={set('password2')} /></Field>
          {err && <div className="err">{err}</div>}
          <button className="btn-primary btn-block" disabled={busy}>Сохранить и войти</button>
        </>}
      </form>
    </div>
  );
}
