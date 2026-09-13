import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { suggest, tonnage } from '@shared/progression.js';
import { DOW_SHORT, DOW_FULL, weeklyCount } from '@shared/schedule.js';
import { Field, Confirm, fmtDate, today, useToast } from '../components/ui.jsx';
import MachineButton from '../components/MachinePopup.jsx';

// Черновик тренировки переживает обновление страницы, закрытие вкладки и разряженный телефон.
// Живёт только в этом браузере — на сервер уходит уже готовая запись.
const DRAFT_KEY = 'workout-draft';
const readDraft = () => { try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
const writeDraft = (w) => { try { w ? localStorage.setItem(DRAFT_KEY, JSON.stringify(w)) : localStorage.removeItem(DRAFT_KEY); } catch {} };
/** Есть ли что терять: заполненный подход, заметка, боль или отметка «готово». */
const hasData = (w) => !!w && (
  w.pain != null || (w.notes || '').trim() !== '' ||
  (w.exercises || []).some((e) => e.done || e.skipped || (e.duration || '') !== '' || (e.sets || []).some((s) => s.w !== '' || s.r !== ''))
);

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

export default function Workout({ state, reload, setTab }) {
  const toast = useToast();
  const { program, profile, workouts, next_day, next_planned, missed = [], adherence } = state;
  const [editing, setEditing] = useState(readDraft); // {id?, date, type, exercises, pain, notes}
  useEffect(() => { writeDraft(editing); }, [editing]);
  const planned = next_planned;
  const [day, setDay] = useState(planned?.suggested_type || next_day || 'A');
  const [date, setDate] = useState(planned?.status === 'today' ? planned.date : (state.today || today()));
  const dayItems = program?.days?.[day] || [];
  const suggestions = useMemo(
    () => Object.fromEntries(dayItems.map((it) => [it.id, suggest(it, workouts, { adaptation: !!profile.adaptation_period, today: date })])),
    [dayItems, workouts, profile.adaptation_period, date]
  );
  const perWeek = weeklyCount(profile);

  function start(d = date, type = day) {
    const items = program?.days?.[type] || [];
    const sugg = Object.fromEntries(items.map((it) => [it.id, suggest(it, workouts, { adaptation: !!profile.adaptation_period, today: d })]));
    setEditing({ date: d, type, exercises: blankFromProgram(items, sugg), pain: null, notes: '' });
    window.scrollTo(0, 0);
  }
  function openExisting(w) {
    setEditing({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: (e.sets || []).map((s) => ({ ...s })) })) });
    window.scrollTo(0, 0);
  }
  async function skip(d, type, reason) {
    try { await api.post('/api/skip', { date: d, type, reason }); toast('Отмечено как пропуск'); await reload(); }
    catch (e) { toast(e.message); }
  }

  if (editing) return <Editor w={editing} setW={setEditing} state={state} program={program} suggestions={editing.id ? {} : suggestions} onClose={() => setEditing(null)} reload={reload} toast={toast} />;

  const sorted = [...workouts].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  return (
    <div className="cols2">
      {perWeek === 0 && (
        <div className="card span2">
          <h2>Расписание не настроено</h2>
          <p className="small muted">Выбери, сколько раз в неделю тренируешься и в какие дни. Тогда приложение будет напоминать, что сегодня по плану, и учитывать пропуски.</p>
          <button className="btn-primary" onClick={() => setTab && setTab('settings')}>Настроить расписание</button>
        </div>
      )}

      {perWeek > 0 && <PlanCard className="plan" planned={planned} missed={missed} adherence={adherence} onStart={start} onSkip={skip} today={state.today} />}

      <div className="card session">
        <div className="row between">
          <h2>{planned?.status === 'today' ? 'Сегодняшняя тренировка' : 'Новая тренировка'}</h2>
          <span className="chip accent">далее по плану: {planned?.suggested_type || next_day}</span>
        </div>
        <div className="row" style={{ margin: '8px 0' }}>
          <Field label="Дата"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <div className="seg" style={{ margin: '0 0 12px' }}>
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
        <button className="btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => start()}>Начать тренировку {day}</button>
      </div>

      <div className="card history">
        <h2>История</h2>
        {sorted.length === 0 && <p className="muted small">Тренировок пока нет.</p>}
        {sorted.map((w) => w.status === 'skipped' ? (
          <div key={w.id} className="list-item muted">
            <div>
              <div><b>{fmtDate(w.date)}</b> · {DOW_SHORT[dowNum(w.date)]} · <span className="chip">пропуск</span> {w.type}</div>
              {w.notes && <div className="small">{w.notes}</div>}
            </div>
            <Confirm className="btn-sm btn-ghost" onYes={async () => { await api.del(`/api/workouts/${w.id}`); await reload(); }}>убрать</Confirm>
          </div>
        ) : (
          <div key={w.id} className="list-item" onClick={() => openExisting(w)} style={{ cursor: 'pointer' }}>
            <div>
              <div><b>{fmtDate(w.date)}</b> · {DOW_SHORT[dowNum(w.date)]} · день {w.type} <span className="muted small">· {w.exercises.filter((e) => e.done).length}/{w.exercises.filter((e) => !e.skipped).length} упр.</span></div>
              <div className="small muted">тоннаж {Math.round(tonnage(w, program))} кг{w.pain != null ? ` · колено ${w.pain}/10` : ' · боль не указана'}</div>
              {w.exercises.filter((e) => e.skipped).map((e, k) => (
                <div key={k} className="tiny muted">пропущено: {e.name}{e.skip_reason ? ` — ${e.skip_reason}` : ''}</div>
              ))}
            </div>
            <span className="muted">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const dowNum = (date) => (new Date(`${String(date).slice(0, 10)}T00:00:00Z`).getUTCDay() || 7);

function PlanCard({ className = '', planned, missed, adherence, onStart, onSkip, today }) {
  const [skipping, setSkipping] = useState(null); // {date, type}
  const [reason, setReason] = useState('');
  const isToday = planned?.status === 'today';
  const catchUp = planned && planned.suggested_type !== planned.planned_type;

  return (
    <div className={'card ' + className}>
      <div className="row between">
        <h2>План</h2>
        {adherence?.planned > 0 && (
          <span className="chip" title="выполнено из запланированного за последний месяц">
            за месяц {adherence.done} из {adherence.planned}
          </span>
        )}
      </div>

      {planned ? (
        <>
          <p style={{ margin: '4px 0 8px' }}>
            {isToday
              ? <>Сегодня <b>{DOW_FULL[planned.dow]}</b> — тренировка <b className="accent">{planned.suggested_type}</b></>
              : <>Сегодня отдых. Ближайшая: <b>{DOW_FULL[planned.dow]}, {fmtDate(planned.date)}</b> — <b className="accent">{planned.suggested_type}</b></>}
          </p>
          {catchUp && (
            <p className="tiny warn">По расписанию здесь {planned.planned_type}, но по очереди следующая {planned.suggested_type}. Предлагаю её, иначе нагрузка перекосится. Тип можно сменить ниже.</p>
          )}
          <div className="row wrap">
            <button className="btn-primary grow" onClick={() => onStart(isToday ? planned.date : today, planned.suggested_type)}>
              {isToday ? 'Начать' : 'Тренироваться сегодня'}
            </button>
            {isToday && <button className="btn-sm" onClick={() => setSkipping({ date: planned.date, type: planned.suggested_type })}>Пропустить</button>}
          </div>
        </>
      ) : <p className="small muted">Ближайших тренировок по расписанию нет.</p>}

      {missed.length > 0 && (
        <>
          <div className="hr" />
          <div className="small"><b>Пропущенные дни</b> <span className="muted">— отметь, чтобы план остался честным</span></div>
          {missed.slice(-4).map((m) => (
            <div key={m.date} className="list-item small">
              <span>{DOW_SHORT[m.dow]} {fmtDate(m.date)} · {m.planned_type}</span>
              <span className="row">
                <button className="btn-sm btn-ghost" onClick={() => onStart(m.date, m.planned_type)}>внести</button>
                <button className="btn-sm btn-ghost" onClick={() => setSkipping({ date: m.date, type: m.planned_type })}>пропуск</button>
              </span>
            </div>
          ))}
        </>
      )}

      {skipping && (
        <div className="card sub" style={{ marginTop: 10 }}>
          <div className="small">Пропуск {fmtDate(skipping.date)} · {skipping.type}</div>
          <Field label="Причина (необязательно)">
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="болел, работа, не было сил…" />
          </Field>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn-primary grow" onClick={() => { onSkip(skipping.date, skipping.type, reason); setSkipping(null); setReason(''); }}>Отметить пропуск</button>
            <button className="btn-ghost" onClick={() => { setSkipping(null); setReason(''); }}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Editor({ w, setW, state, program, suggestions, onClose, reload, toast }) {
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(0);
  const items = program?.days?.[w.type] || [];
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  // Обновляемся только через функциональную форму: два быстрых изменения подряд
  // (вес → повторы, переход по «Далее» на клавиатуре) иначе строятся из устаревшего w и затирают друг друга.
  const upd = (i, patch) => setW((prev) => ({ ...prev, exercises: prev.exercises.map((e, k) => (k === i ? { ...e, ...patch } : e)) }));
  const updSet = (i, j, patch) => setW((prev) => ({
    ...prev,
    exercises: prev.exercises.map((e, k) => (k === i ? { ...e, sets: e.sets.map((st, m) => (m === j ? { ...st, ...patch } : st)) } : e)),
  }));
  const updSets = (i, fn) => setW((prev) => ({ ...prev, exercises: prev.exercises.map((e, k) => (k === i ? { ...e, sets: fn(e.sets) } : e)) }));

  /** Подходы, где есть вес, но не заполнены повторы: обычно это незаписанные данные, а не ноль. */
  function setsWithoutReps(x) {
    let n = 0;
    for (const e of x.exercises || []) {
      if (e.skipped) continue;
      for (const st of e.sets || []) if ((st.w !== '' && Number(st.w) > 0) && (st.r === '' || Number(st.r) === 0)) n++;
    }
    return n;
  }

  async function save(force = false) {
    if (w.pain == null) { toast('Отметь боль в колене (0–10) — это обязательное поле'); return; }
    const empty = setsWithoutReps(w);
    if (empty > 0 && !force) { setWarn(empty); return; }
    setWarn(0);
    setBusy(true);
    try {
      const body = { ...w, exercises: w.exercises.map((e) => (
        e.skipped
          ? { ...e, done: false, sets: [], skip_reason: (e.skip_reason || '').trim() }
          : { ...e, sets: e.sets.filter((s) => s.w !== '' || s.r !== '').map((s) => ({ w: Number(s.w) || 0, r: Number(s.r) || 0 })) }
      )) };
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
          {hasData(w)
            ? <Confirm className="btn-sm btn-ghost" text="Выйти и стереть?" onYes={onClose}>Закрыть</Confirm>
            : <button className="btn-sm btn-ghost" onClick={onClose}>Закрыть</button>}
        </div>
        <div className="grid2">
          <Field label="Дата"><input type="date" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} /></Field>
          <Field label="День"><select value={w.type} onChange={(e) => setW({ ...w, type: e.target.value })}>{Object.keys(program?.days || {}).map((d) => <option key={d}>{d}</option>)}</select></Field>
        </div>
        <div className="tiny muted">Черновик сохраняется сам — можно обновить страницу или закрыть вкладку, введённое останется.</div>
      </div>

      <div className="ex-grid">
      {w.exercises.map((ex, i) => {
        const it = itemById[ex.program_id] || items.find((p) => p.name === ex.name);
        const s = suggestions[ex.program_id];
        const cardio = it?.cardio || (!ex.sets?.length && it?.cardio !== false && /разминка|заминка|эллипс|дорожк|ходьба|вело/i.test(ex.name));
        return (
          <div key={i} className={'card' + (ex.done ? ' done' : '') + (ex.skipped ? ' skipped-ex' : '')}>
            <div className="row between">
              <div className="grow">
                <div className="ex-title">{ex.name}</div>
                {it && <div className="tiny muted">{it.machine}{it.machine_type ? <> · <MachineButton state={state} type={it.machine_type} label="фото" /></> : null}</div>}
              </div>
              <div className="row">
                {!ex.skipped && <button className={'btn-sm ' + (ex.done ? 'btn-primary' : '')} onClick={() => upd(i, { done: !ex.done })}>{ex.done ? '✓' : 'готово'}</button>}
                <button className="btn-sm btn-ghost" title={ex.skipped ? 'Вернуть упражнение' : 'Пропустить упражнение'}
                  onClick={() => upd(i, ex.skipped ? { skipped: false, skip_reason: '' } : { skipped: true, done: false })}>
                  {ex.skipped ? 'вернуть' : 'пропустить'}
                </button>
              </div>
            </div>
            {ex.skipped ? (
              <Field label="Почему пропустил (попадёт в историю)">
                <input value={ex.skip_reason || ''} onChange={(e) => upd(i, { skip_reason: e.target.value })}
                  placeholder="занят тренажёр, боль, нет времени…" />
              </Field>
            ) : (
            <>
            {it?.technique && <details><summary>техника</summary><p className="small muted">{it.technique}</p></details>}
            {s && !s.first && (
              <div className="sugg" style={{ margin: '8px 0' }}>
                <span>Рекомендация: <b>{s.w}{it?.per_hand ? ' кг/рука' : ' кг'} × {s.reps} × {s.sets}</b>{s.warmup ? <span className="muted"> · разминка {s.warmup}</span> : null}<div className="tiny muted">{s.note}</div></span>
                <button className="btn-sm" onClick={() => updSets(i, (sets) => Array.from({ length: s.sets }, (_, k) => (sets[k] ? { ...sets[k], w: s.w } : { w: s.w, r: '' })))}>применить</button>
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
                        <button className="btn-sm btn-ghost" onClick={() => updSets(i, (sets) => sets.filter((_, k) => k !== j))}>✕</button>
                  </div>
                ))}
                <button className="btn-sm btn-ghost" onClick={() => updSets(i, (sets) => [...sets, { w: sets.at(-1)?.w ?? '', r: '' }])}>+ подход</button>
              </div>
            )}
            </>
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
        {warn > 0 && (
          <div className="banner alarm" style={{ marginTop: 10 }}>
            <span className="small">
              В {warn} {warn === 1 ? 'подходе' : 'подходах'} указан вес, но не заполнены повторы. Допиши их — иначе прогрессия решит, что подход не сделан.
            </span>
            <button className="btn-sm btn-ghost" onClick={() => save(true)}>всё равно сохранить</button>
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn-primary grow" disabled={busy} onClick={() => save()}>Сохранить</button>
          {w.id && <Confirm onYes={remove}>Удалить</Confirm>}
        </div>
      </div>
    </>
  );
}
