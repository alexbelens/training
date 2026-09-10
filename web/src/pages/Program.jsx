import React, { useState } from 'react';
import { api } from '../api.js';
import { validateProgram } from '@shared/constraints.js';
import { Field, Confirm, fmtDate, useToast } from '../components/ui.jsx';
import MachineButton from '../components/MachinePopup.jsx';
import { machineTypeGroups, machineTypeLabel } from '@shared/machine-types.js';

const newId = (day) => `${day.toLowerCase()}${Date.now().toString(36).slice(-4)}`;

export default function Program({ state, reload }) {
  const toast = useToast();
  const { program, profile } = state;
  const [edit, setEdit] = useState(null); // копия программы в редактировании
  const [history, setHistory] = useState(null);
  const [rationale, setRationale] = useState('');

  async function save() {
    const errors = validateProgram(edit, profile);
    if (errors.length) { toast(errors[0]); return; }
    try { await api.put('/api/program', { schema: edit.schema, days: edit.days, rationale }); toast(`Сохранена версия ${program.version + 1}`); setEdit(null); setRationale(''); await reload(); }
    catch (e) { toast((e.body?.errors || [e.message])[0]); }
  }
  async function loadHistory() { setHistory(await api.get('/api/program/history')); }
  async function rollback(id) { await api.post(`/api/program/rollback/${id}`); toast('Откат выполнен'); setHistory(null); await reload(); }

  if (!program) return <div className="card">Программы нет</div>;

  if (edit) {
    const days = Object.keys(edit.days);
    const updItem = (d, i, patch) => setEdit({ ...edit, days: { ...edit.days, [d]: edit.days[d].map((it, k) => (k === i ? { ...it, ...patch } : it)) } });
    const move = (d, i, dir) => { const arr = [...edit.days[d]]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; setEdit({ ...edit, days: { ...edit.days, [d]: arr } }); };
    const remove = (d, i) => setEdit({ ...edit, days: { ...edit.days, [d]: edit.days[d].filter((_, k) => k !== i) } });
    const add = (d) => setEdit({ ...edit, days: { ...edit.days, [d]: [...edit.days[d], { id: newId(d), name: '', target_sets: 3, target_reps: 12, step: 2.5, machine: '', technique: '', machine_type: '' }] } });
    return (
      <>
        <div className="card">
          <div className="row between"><h2>Редактирование программы</h2><button className="btn-sm btn-ghost" onClick={() => setEdit(null)}>Отмена</button></div>
          <Field label="Схема / примечания"><textarea value={edit.schema || ''} onChange={(e) => setEdit({ ...edit, schema: e.target.value })} /></Field>
        </div>
        <div className="days">
        {days.map((d) => (
          <div key={d} className="card">
            <h2>День {d}</h2>
            {edit.days[d].map((it, i) => (
              <div key={it.id} className="card sub stack">
                <div className="row">
                  <input className="grow" placeholder="Название упражнения" value={it.name} onChange={(e) => updItem(d, i, { name: e.target.value })} />
                  <button className="btn-sm btn-ghost" onClick={() => move(d, i, -1)}>↑</button>
                  <button className="btn-sm btn-ghost" onClick={() => move(d, i, 1)}>↓</button>
                  <button className="btn-sm btn-danger" onClick={() => remove(d, i)}>✕</button>
                </div>
                <div className="row wrap small">
                  <label className="check"><input type="checkbox" checked={!!it.cardio} onChange={(e) => updItem(d, i, { cardio: e.target.checked })} />кардио</label>
                  <label className="check"><input type="checkbox" checked={!!it.knee_sensitive} onChange={(e) => updItem(d, i, { knee_sensitive: e.target.checked })} />колено</label>
                  <label className="check"><input type="checkbox" checked={!!it.no_progression} onChange={(e) => updItem(d, i, { no_progression: e.target.checked })} />без прогрессии</label>
                  <label className="check"><input type="checkbox" checked={!!it.per_hand} onChange={(e) => updItem(d, i, { per_hand: e.target.checked })} />вес на руку</label>
                  <label className="check"><input type="checkbox" checked={!!it.warmup} onChange={(e) => updItem(d, i, { warmup: e.target.checked })} />разминочный подход</label>
                </div>
                {it.cardio ? (
                  <Field label="Длительность"><input value={it.duration || ''} onChange={(e) => updItem(d, i, { duration: e.target.value })} /></Field>
                ) : (
                  <div className="row">
                    <Field label="Подходы"><input type="number" inputMode="numeric" value={it.target_sets ?? ''} onChange={(e) => updItem(d, i, { target_sets: Number(e.target.value) })} /></Field>
                    <Field label="Повторы"><input type="number" inputMode="numeric" value={it.target_reps ?? ''} onChange={(e) => updItem(d, i, { target_reps: Number(e.target.value) })} /></Field>
                    <Field label="Шаг, кг"><input type="number" inputMode="decimal" step="0.5" value={it.step ?? 2.5} onChange={(e) => updItem(d, i, { step: Number(e.target.value) })} /></Field>
                    <Field label="Ед."><input value={it.unit || ''} placeholder="повт." onChange={(e) => updItem(d, i, { unit: e.target.value || undefined })} /></Field>
                  </div>
                )}
                <Field label="Тренажёр / где искать"><input value={it.machine || ''} onChange={(e) => updItem(d, i, { machine: e.target.value })} /></Field>
                <Field label="Техника, ограничения"><textarea value={it.technique || ''} onChange={(e) => updItem(d, i, { technique: e.target.value })} /></Field>
                <Field label="Тип тренажёра">
                  <select value={it.machine_type || ''} onChange={(e) => updItem(d, i, { machine_type: e.target.value || undefined })}>
                    <option value="">— без тренажёра —</option>
                    {machineTypeGroups().map(([group, types]) => (
                      <optgroup key={group} label={group}>
                        {types.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              </div>
            ))}
            <button className="btn-sm" onClick={() => add(d)}>+ упражнение</button>
          </div>
        ))}
        </div>
        <div className="card stack">
          <Field label="Что и почему изменил (попадёт в историю версий)"><input value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
          {validateProgram(edit, profile).map((e, i) => <div key={i} className="err">{e}</div>)}
          <button className="btn-primary btn-block" onClick={save}>Сохранить как версию {program.version + 1}</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="card">
        <div className="row between">
          <h2>Программа · v{program.version}</h2>
          <button className="btn-sm" onClick={() => setEdit(JSON.parse(JSON.stringify({ schema: program.schema, days: program.days })))}>Редактировать</button>
        </div>
        <p className="small muted">{program.schema}</p>
        <div className="tiny muted">{program.author === 'coach' ? 'изменено тренером' : program.author === 'system' ? 'стартовая' : 'изменено тобой'} · {fmtDate(program.created_at)}{program.rationale ? ` · ${program.rationale}` : ''}</div>
      </div>
      <div className="days">
      {Object.entries(program.days).map(([d, items]) => (
        <div key={d} className="card">
          <h2>День {d}</h2>
          {items.map((it, i) => (
            <div key={it.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div><span className="muted small">{i + 1}. </span><b>{it.name}</b> {it.knee_sensitive && <span className="chip" title="чувствительно к колену">колено</span>} {it.no_progression && <span className="chip">без прогрессии</span>}</div>
                <div className="small muted">{it.machine}</div>
                {it.technique && <div className="small" style={{ marginTop: 4 }}>{it.technique}</div>}
                {it.machine_type && <div className="tiny muted">{machineTypeLabel(it.machine_type)} · <MachineButton state={state} type={it.machine_type} /></div>}
              </div>
              <div className="accent small" style={{ whiteSpace: 'nowrap' }}>{it.cardio ? it.duration : `${it.target_sets}×${it.target_reps}${it.unit ? ' ' + it.unit : ''}`}</div>
            </div>
          ))}
        </div>
      ))}
      </div>
      <div className="card">
        {!history ? <button className="btn-sm btn-ghost" onClick={loadHistory}>История версий</button> : (
          <>
            <h3>История версий</h3>
            {history.map((h) => (
              <div key={h.id} className="list-item">
                <div className="small"><b>v{h.version}</b> {h.active ? <span className="chip ok">текущая</span> : null} <span className="muted">· {fmtDate(h.created_at)} · {h.author}{h.rationale ? ` · ${h.rationale}` : ''}</span></div>
                {!h.active && <Confirm className="btn-sm" onYes={() => rollback(h.id)}>Откатить</Confirm>}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
