import React, { useMemo, useState } from 'react';
import { api } from '../api.js';
import { tonnage, sessionsFor, workingWeight, weightUnit } from '@shared/progression.js';
import LineChart from '../components/LineChart.jsx';
import { Field, fmtDate, today, useToast } from '../components/ui.jsx';

export default function Progress({ state, reload }) {
  const toast = useToast();
  const { weights, workouts, program, profile } = state;
  const allItems = useMemo(() => Object.values(program?.days || {}).flat().filter((i) => !i.cardio), [program]);
  const [exId, setExId] = useState(allItems.find((i) => sessionsFor(i, workouts).length)?.id || allItems[0]?.id);
  const [wt, setWt] = useState({ date: today(), kg: '' });
  const sorted = useMemo(() => [...workouts].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id), [workouts]);
  const ex = allItems.find((i) => i.id === exId);
  const exPoints = ex ? sessionsFor(ex, sorted).map((s) => ({ x: fmtDate(s.workout.date), y: workingWeight(s.exercise.sets) })) : [];

  async function addWeight() {
    if (!(Number(wt.kg) > 0)) return;
    await api.post('/api/weights', wt); toast('Вес записан'); setWt({ date: today(), kg: '' }); await reload();
  }
  const lastW = weights.at(-1);
  const start = profile.start_weight_kg || weights[0]?.kg;

  return (
    <div className="cols2">
      <div className="card">
        <div className="row between"><h2>Вес тела</h2>{lastW && <span className="chip accent">{lastW.kg} кг{start ? ` · ${(lastW.kg - start > 0 ? '+' : '')}${(lastW.kg - start).toFixed(1)}` : ''}</span>}</div>
        <LineChart points={weights.map((w) => ({ x: fmtDate(w.date), y: w.kg }))} target={profile.target_weight_kg || null} unit="кг" />
        <div className="row" style={{ marginTop: 8 }}>
          <input type="date" value={wt.date} onChange={(e) => setWt({ ...wt, date: e.target.value })} />
          <input className="num" type="number" inputMode="decimal" step="0.1" placeholder="кг" value={wt.kg} onChange={(e) => setWt({ ...wt, kg: e.target.value })} />
          <button className="btn-primary" onClick={addWeight}>+</button>
        </div>
        <p className="tiny muted">Взвешивание раз в неделю утром. Пунктир — цель {profile.target_weight_kg ? `${profile.target_weight_kg} кг` : '(укажи в настройках)'}.</p>
      </div>

      <div className="card">
        <h2>Боль в колене</h2>
        <LineChart points={sorted.filter((w) => w.pain != null).map((w) => ({ x: fmtDate(w.date), y: w.pain }))} unit="/10" height={120} yMin={0} yMax={10} />
      </div>

      <div className="card">
        <h2>Рабочий вес</h2>
        <select value={exId || ''} onChange={(e) => setExId(e.target.value)} style={{ marginBottom: 8 }}>
          {allItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <LineChart points={exPoints} unit={weightUnit(ex).label} />
      </div>

      <div className="card">
        <h2>Тоннаж за тренировку</h2>
        <LineChart bars points={sorted.map((w) => ({ x: `${fmtDate(w.date)} ${w.type}`, y: Math.round(tonnage(w, program)) }))} unit="кг" />
      </div>

      {weights.length > 0 && (
        <details className="card span2"><summary>Все взвешивания</summary>
          {[...weights].reverse().map((w) => (
            <div key={w.date} className="list-item small"><span>{fmtDate(w.date)}</span><span>{w.kg} кг</span><button className="btn-sm btn-ghost" onClick={async () => { await api.del(`/api/weights/${w.date}`); await reload(); }}>✕</button></div>
          ))}
        </details>
      )}
    </div>
  );
}
