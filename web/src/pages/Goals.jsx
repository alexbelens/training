import React, { useState } from 'react';
import { api } from '../api.js';
import { GOAL_KINDS, daysLeft } from '@shared/goals.js';
import { Field, Confirm, fmtDate, useToast } from '../components/ui.jsx';

const blank = { kind: 'lift', title: '', exercise_id: '', target: {}, target_date: '', note: '' };

export default function Goals({ state, reload }) {
  const toast = useToast();
  const { goals = [], program, today } = state;
  const [edit, setEdit] = useState(null);
  const items = Object.values(program?.days || {}).flat().filter((i) => !i.cardio);

  async function save() {
    try {
      const body = { ...edit, target: edit.target || {} };
      if (edit.id) await api.put(`/api/goals/${edit.id}`, body);
      else await api.post('/api/goals', body);
      toast('Цель сохранена'); setEdit(null); await reload();
    } catch (e) { toast(e.message); }
  }
  async function toggleDone(g) {
    await api.post(`/api/goals/${g.id}/done`, { done: !g.done_at });
    await reload();
  }

  const active = goals.filter((g) => !g.progress?.done);
  const done = goals.filter((g) => g.progress?.done);

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2>Цели</h2>
          <button className="btn-sm btn-primary" onClick={() => setEdit({ ...blank })}>+ цель</button>
        </div>
        <p className="small muted">Прогресс считается сам из тренировок и взвешиваний. У каждой цели написано, что делать дальше.</p>
      </div>

      {edit && <GoalForm edit={edit} setEdit={setEdit} items={items} onSave={save} />}

      {active.length === 0 && !edit && <div className="card muted small">Активных целей нет.</div>}
      {active.map((g) => <GoalCard key={g.id} g={g} today={today} onEdit={() => setEdit({ ...g, target: g.target || {} })} onDone={() => toggleDone(g)} reload={reload} />)}

      {done.length > 0 && (
        <div className="card">
          <h3>Достигнуто</h3>
          {done.map((g) => (
            <div key={g.id} className="list-item small">
              <span>✓ {g.title}</span>
              <button className="btn-sm btn-ghost" onClick={() => toggleDone(g)}>вернуть</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function GoalCard({ g, today, onEdit, onDone, reload }) {
  const p = g.progress || {};
  const left = daysLeft(g, today);
  const pct = Math.round((p.percent || 0) * 100);
  return (
    <div className="card">
      <div className="row between">
        <div className="grow">
          <div className="ex-title">{g.title}</div>
          <div className="tiny muted">{GOAL_KINDS[g.kind]}{g.target_date ? ` · до ${fmtDate(g.target_date)}${left != null ? `, осталось ${left} дн.` : ''}` : ''}</div>
        </div>
        <span className={'chip ' + (p.stalled ? 'bad' : pct >= 100 ? 'ok' : 'accent')}>{pct}%</span>
      </div>
      <div className="bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <div className="small" style={{ marginTop: 6 }}>{p.text}</div>
      {p.next_step && <div className="small accent" style={{ marginTop: 4 }}>Дальше: {p.next_step}</div>}
      {p.eta && <div className="tiny muted">при текущем темпе — примерно {fmtDate(p.eta)}</div>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn-sm btn-ghost" onClick={onEdit}>изменить</button>
        {g.kind === 'health' && <button className="btn-sm" onClick={onDone}>отметить сделанным</button>}
        <Confirm className="btn-sm btn-ghost" onYes={async () => { await api.del(`/api/goals/${g.id}`); await reload(); }}>удалить</Confirm>
      </div>
    </div>
  );
}

function GoalForm({ edit, setEdit, items, onSave }) {
  const t = edit.target || {};
  const setT = (patch) => setEdit({ ...edit, target: { ...t, ...patch } });
  return (
    <div className="card stack">
      <h3>{edit.id ? 'Изменить цель' : 'Новая цель'}</h3>
      <Field label="Тип">
        <select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value, target: {} })}>
          {Object.entries(GOAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Название"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="например, жим лёжа 80 кг" /></Field>

      {edit.kind === 'lift' && (
        <>
          <Field label="Упражнение">
            <select value={edit.exercise_id || ''} onChange={(e) => setEdit({ ...edit, exercise_id: e.target.value })}>
              <option value="">— выбери —</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <div className="row">
            <Field label="Вес, кг"><input type="text" inputMode="decimal" value={t.w ?? ''} onChange={(e) => setT({ w: e.target.value })} /></Field>
            <Field label="Повторы"><input type="text" inputMode="numeric" value={t.reps ?? ''} onChange={(e) => setT({ reps: e.target.value })} /></Field>
            <Field label="Подходы"><input type="text" inputMode="numeric" value={t.sets ?? ''} onChange={(e) => setT({ sets: e.target.value })} /></Field>
          </div>
          <Field label="Вес на старте цели (для прогресса)"><input type="text" inputMode="decimal" value={edit.start_value ?? ''} onChange={(e) => setEdit({ ...edit, start_value: e.target.value })} /></Field>
        </>
      )}
      {edit.kind === 'body_weight' && (
        <Field label="Целевой вес, кг"><input type="text" inputMode="decimal" value={t.kg ?? ''} onChange={(e) => setT({ kg: e.target.value })} /></Field>
      )}
      {edit.kind === 'habit' && (
        <Field label="Тренировок в неделю"><input type="text" inputMode="numeric" value={t.per_week ?? ''} onChange={(e) => setT({ per_week: e.target.value })} /></Field>
      )}
      {edit.kind === 'health' && (
        <Field label="Что нужно сделать"><input value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="сходить к ортопеду, сделать МРТ" /></Field>
      )}

      <Field label="Срок (необязательно)"><input type="date" value={edit.target_date || ''} onChange={(e) => setEdit({ ...edit, target_date: e.target.value })} /></Field>
      <div className="row">
        <button className="btn-primary grow" onClick={onSave}>Сохранить</button>
        <button className="btn-ghost" onClick={() => setEdit(null)}>Отмена</button>
      </div>
    </div>
  );
}
