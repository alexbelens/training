import React, { useState } from 'react';
import { api } from '../api.js';
import { Field, fmtDate, useToast } from '../components/ui.jsx';

export default function Coach({ state, reload }) {
  const toast = useToast();
  const { reports, requests, knee_alarm } = state;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(preset) {
    const t = (preset || text).trim(); if (!t) return;
    setBusy(true);
    try { await api.post('/api/coach/requests', { text: t }); setText(''); toast('Запрос тренеру отправлен'); await reload(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function seen(id) { await api.post(`/api/coach/reports/${id}/seen`); await reload(); }

  return (
    <>
      {knee_alarm && <div className="banner alarm"><span><b>Колено 6+ две тренировки подряд.</b> Ноги — только кардио без боли, к ортопеду.</span></div>}
      <div className="card">
        <h2>Тренер</h2>
        <p className="small muted">Разбор делает Claude: он заходит в базу, смотрит историю, боль и веса, и оставляет здесь отчёт и план на следующие тренировки. Если нужно — сам правит программу (появится новая версия).</p>
        <div className="row wrap" style={{ marginBottom: 8 }}>
          <button className="btn-sm" disabled={busy} onClick={() => ask('Разбери последние тренировки и дай план весов на следующие A и B')}>Разбор</button>
          <button className="btn-sm" disabled={busy} onClick={() => ask('Пересобери программу: ' + (text || 'учти текущее состояние и историю'))}>Пересобрать программу</button>
        </div>
        <Field label="Свой вопрос или уточнение (боль, замены, самочувствие…)">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="например: убери разгибание ног, щёлкает колено" />
        </Field>
        <button className="btn-primary btn-block" disabled={busy || !text.trim()} style={{ marginTop: 8 }} onClick={() => ask()}>Отправить тренеру</button>
        {requests.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="tiny muted">Ожидают ответа:</div>
            {requests.map((r) => <div key={r.id} className="small list-item"><span>{r.text}</span><span className="chip">{fmtDate(r.created_at)}</span></div>)}
          </div>
        )}
      </div>

      {reports.length === 0 && <div className="card muted small">Разборов пока нет.</div>}
      {reports.map((r) => <Report key={r.id} r={r} onSeen={() => seen(r.id)} />)}
    </>
  );
}

function Report({ r, onSeen }) {
  return (
    <div className="card" style={r.seen ? {} : { borderColor: 'rgba(245,165,36,.5)' }}>
      <div className="row between">
        <h3>{r.kind === 'program' ? 'Изменение программы' : 'Разбор'} · {fmtDate(r.created_at)}</h3>
        {!r.seen && <button className="btn-sm" onClick={onSeen}>прочитано</button>}
      </div>
      {r.summary && <p>{r.summary}</p>}
      {r.text && <pre className="md">{r.text}</pre>}
      {r.good?.length > 0 && <><div className="tiny ok" style={{ marginTop: 6 }}>Что хорошо</div><ul className="small" style={{ margin: '2px 0 6px', paddingLeft: 18 }}>{r.good.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
      {r.concerns?.length > 0 && <><div className="tiny warn">Что настораживает</div><ul className="small" style={{ margin: '2px 0 6px', paddingLeft: 18 }}>{r.concerns.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
      {r.next && Object.entries(r.next).map(([day, items]) => items?.length > 0 && (
        <div key={day} style={{ marginTop: 6 }}>
          <div className="tiny accent">План на {day}</div>
          <table className="table">
            <tbody>{items.map((it, i) => <tr key={i}><td>{it.exercise}</td><td style={{ whiteSpace: 'nowrap' }}><b>{it.w != null ? `${it.w} кг` : '—'}</b> × {it.reps} × {it.sets}</td><td className="muted tiny">{it.note}</td></tr>)}</tbody>
          </table>
        </div>
      ))}
      {r.one_recommendation && <p className="small" style={{ marginTop: 8 }}><b>Рекомендация:</b> {r.one_recommendation}</p>}
      {r.ask_user && <p className="small accent"><b>Вопрос тренера:</b> {r.ask_user}</p>}
      {r.see_doctor && <p className="small bad">Тренер настаивает: покажись ортопеду / сделай МРТ.</p>}
    </div>
  );
}
