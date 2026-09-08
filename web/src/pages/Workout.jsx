import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { suggest, tonnage } from '@shared/progression.js';
import { Field, Confirm, fmtDate, today, photoUrl, useToast } from '../components/ui.jsx';

function blankFromProgram(items, suggestions) {
  return items.map((it) => {
    const s = suggestions[it.id];
    const n = it.cardio ? 0 : (s?.sets || it.target_sets || 3);
    return {
      program_id: it.id, name: it.name, done: false,
      sets: Array.from({ length: n }, () => ({ w: s && !s.first ? s.w : '', r: '' })),
      duration: '',
    };
  });
}

export default function Workout({ state, reload }) {
  const toast = useToast();
  const { program, profile, workouts, next_day } = state;
  const [editing, setEditing] = useState(null); // {id?, date, type, exercises, pain, notes}
  const [day, setDay] = useState(next_day || 'A');
  const dayItems = program?.days?.[day] || [];
  const suggestions = useMemo(() => Object.fromEntries(dayItems.map((it) => [it.id, suggest(it, workouts, { adaptation: !!profile.adaptation_period })])), [dayItems, workouts, profile.adaptation_period]);

  function start() {
    setEditing({ date: today(), type: day, exercises: blankFromProgram(dayItems, suggestions), pain: null, notes: '' });
    window.scrollTo(0, 0);
  }
  function openExisting(w) {
    setEditing({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: (e.sets || []).map((s) => ({ ...s })) })) });
    window.scrollTo(0, 0);
  }

  if (editing) return <Editor w={editing} setW={setEditing} program={program} suggestions={editing.id ? {} : suggestions} onClose={() => setEditing(null)} reload={reload} toast={toast} />;

  const sorted = [...workouts].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  return (
    <div className="cols2">
      <div className="card">
        <div className="row between">
          <h2>Новая тренировка</h2>
          <span className="chip accent">далее по схеме: {next_day}</span>
        </div>
        <div className="seg" style={{ margin: '8px 0 12px' }}>
          {Object.keys(program?.days || {}).map((d) => <button key={d} className={d === day ? 'active' : ''} onClick={() => setDay(d)}>{d}</button>)}
        </div>
        <div className="stack">
          {dayItems.map((it) => {
            const s = suggestions[it.id];
            return (
              <div key={it.id} className="row between small">
                <span className="grow">{it.name}</span>
                {it.cardio ? <span className="muted">{it.duration}</span>
                  : s?.first ? <span className="muted">подобрать вес</span>
                  : s ? <span className="accent">{s.w}{it.per_hand ? '/рука' : ''} × {s.reps} × {s.sets}</span>
                  : <span className="muted">{it.target_sets}×{it.target_reps}{it.unit ? ' ' + it.unit : ''}</span>}
              </div>
            );
          })}
        </div>
        {profile.adaptation_period && <p className="tiny muted" style={{ marginTop: 10 }}>Адаптационный период: 2 рабочих подхода. Выключается в настройках.</p>}
        <button className="btn-primary btn-block" style={{ marginTop: 10 }} onClick={start}>Начать тренировку {day}</button>
      </div>

      <div className="card">
        <h2>История</h2>
        {sorted.length === 0 && <p className="muted small">Тренировок пока нет.</p>}
        {sorted.map((w) => (
          <div key={w.id} className="list-item" onClick={() => openExisting(w)} style={{ cursor: 'pointer' }}>
            <div>
              <div><b>{fmtDate(w.date)}</b> · день {w.type} <span className="muted small">· {w.exercises.filter((e) => e.done).length}/{w.exercises.length} упр.</span></div>
              <div className="small muted">тоннаж {Math.round(tonnage(w, program))} кг{w.pain != null ? ` · колено ${w.pain}/10` : ' · боль не указана'}</div>
            </div>
            <span className="muted">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Editor({ w, setW, program, suggestions, onClose, reload, toast }) {
  const [busy, setBusy] = useState(false);
  const items = program?.days?.[w.type] || [];
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  const upd = (i, patch) => setW({ ...w, exercises: w.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const updSet = (i, j, patch) => upd(i, { sets: w.exercises[i].sets.map((s, k) => (k === j ? { ...s, ...patch } : s)) });

  async function save() {
    if (w.pain == null) { toast('Отметь боль в колене (0–10) — это обязательное поле'); return; }
    setBusy(true);
    try {
      const body = { ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.w !== '' || s.r !== '').map((s) => ({ w: Number(s.w) || 0, r: Number(s.r) || 0 })) })) };
      if (w.id) await api.put(`/api/workouts/${w.id}`, body); else await api.post('/api/workouts', body);
      toast('Сохранено'); await reload(); onClose();
    } catch (e) { toast('Ошибка: ' + e.message); } finally { setBusy(false); }
  }
  async function remove() { await api.del(`/api/workouts/${w.id}`); toast('Удалено'); await reload(); onClose(); }

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2>{w.id ? 'Тренировка' : 'Новая'} · день {w.type}</h2>
          <button className="btn-sm btn-ghost" onClick={onClose}>Закрыть</button>
        </div>
        <div className="grid2">
          <Field label="Дата"><input type="date" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} /></Field>
          <Field label="День"><select value={w.type} onChange={(e) => setW({ ...w, type: e.target.value })}>{Object.keys(program?.days || {}).map((d) => <option key={d}>{d}</option>)}</select></Field>
        </div>
      </div>

      <div className="ex-grid">
      {w.exercises.map((ex, i) => {
        const it = itemById[ex.program_id] || items.find((p) => p.name === ex.name);
        const s = suggestions[ex.program_id];
        const cardio = it?.cardio || (!ex.sets?.length && it?.cardio !== false && /разминка|заминка|эллипс|дорожк|ходьба|вело/i.test(ex.name));
        return (
          <div key={i} className={'card' + (ex.done ? ' done' : '')}>
            <div className="row between">
              <div className="grow">
                <div className="ex-title">{ex.name}</div>
                {it && <div className="tiny muted">{it.machine}{it.photo_query ? <> · <a href={photoUrl(it.photo_query)} target="_blank" rel="noreferrer">фото</a></> : null}</div>}
              </div>
              <button className={'btn-sm ' + (ex.done ? 'btn-primary' : '')} onClick={() => upd(i, { done: !ex.done })}>{ex.done ? '✓' : 'готово'}</button>
            </div>
            {it?.technique && <details><summary>техника</summary><p className="small muted">{it.technique}</p></details>}
            {s && !s.first && (
              <div className="sugg" style={{ margin: '8px 0' }}>
                <span>Рекомендация: <b>{s.w}{it?.per_hand ? ' кг/рука' : ' кг'} × {s.reps} × {s.sets}</b>{s.warmup ? <span className="muted"> · разминка {s.warmup}</span> : null}<div className="tiny muted">{s.note}</div></span>
                <button className="btn-sm" onClick={() => upd(i, { sets: Array.from({ length: s.sets }, (_, k) => ex.sets[k] ? { ...ex.sets[k], w: s.w } : { w: s.w, r: '' }) })}>применить</button>
              </div>
            )}
            {s?.first && <div className="sugg" style={{ margin: '8px 0' }}><span className="small">{s.note}</span></div>}
            {cardio ? (
              <Field label="Длительность / заметка"><input placeholder={it?.duration || 'например, 8 мин'} value={ex.duration || ''} onChange={(e) => upd(i, { duration: e.target.value })} /></Field>
            ) : (
              <div className="stack">
                <div className="set-row tiny muted"><span /><span className="n">{it?.per_hand ? 'кг/рука' : it?.bodyweight ? 'доп. кг' : 'кг'}</span><span /><span className="n">{it?.unit || 'повт.'}</span><span /></div>
                {ex.sets.map((st, j) => (
                  <div key={j} className="set-row">
                    <span className="n">{j + 1}</span>
                    <input className="num" type="number" inputMode="decimal" step="0.5" value={st.w} placeholder="0" onChange={(e) => updSet(i, j, { w: e.target.value })} />
                    <span className="x">×</span>
                    <input className="num" type="number" inputMode="numeric" value={st.r} placeholder={String(it?.target_reps || '')} onChange={(e) => updSet(i, j, { r: e.target.value })} />
                    <button className="btn-sm btn-ghost" onClick={() => upd(i, { sets: ex.sets.filter((_, k) => k !== j) })}>✕</button>
                  </div>
                ))}
                <button className="btn-sm btn-ghost" onClick={() => upd(i, { sets: [...ex.sets, { w: ex.sets.at(-1)?.w ?? '', r: '' }] })}>+ подход</button>
              </div>
            )}
          </div>
        );
      })}
      </div>

      <div className="card">
        <h3>Боль в колене после тренировки (0–10) <span className="bad">*</span></h3>
        <div className="pain">{Array.from({ length: 11 }, (_, n) => <button key={n} className={w.pain === n ? 'active' : ''} onClick={() => setW({ ...w, pain: n })}>{n}</button>)}</div>
        <p className="tiny muted">0 — нет боли, 3 — «терпимо», 6+ — снижаем нагрузку на ноги.</p>
        <Field label="Заметки"><textarea value={w.notes || ''} onChange={(e) => setW({ ...w, notes: e.target.value })} placeholder="самочувствие, что заменил, что болело…" /></Field>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn-primary grow" disabled={busy} onClick={save}>Сохранить</button>
          {w.id && <Confirm onYes={remove}>Удалить</Confirm>}
        </div>
      </div>
    </>
  );
}
