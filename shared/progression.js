// Детерминированные правила авто-прогрессии (раздел 5 спеки).
// Используется и на сервере (для coach-API), и в браузере.

export function roundToStep(value, step = 2.5) {
  if (!step || step <= 0) step = 2.5;
  return Math.round(value / step) * step;
}

/** Округление вниз — для снижений при боли (безопаснее недобрать, чем перебрать). */
export function floorToStep(value, step = 2.5) {
  if (!step || step <= 0) step = 2.5;
  return Math.floor(value / step + 1e-9) * step;
}

/** Максимальный вес в списке подходов (рабочий вес = максимум, «пирамида» учитывается). */
export function workingWeight(sets) {
  return sets.reduce((m, s) => Math.max(m, Number(s.w) || 0), 0);
}

/**
 * Сессии, где упражнение выполнено (есть подходы). Сопоставление по id элемента программы
 * или по имени (для старых записей / импорта).
 */
export function sessionsFor(exercise, workouts) {
  const name = normName(exercise.name);
  const out = [];
  for (const w of workouts) {
    const ex = (w.exercises || []).find(
      (e) => (exercise.id && e.program_id === exercise.id) || normName(e.name) === name
    );
    if (ex && Array.isArray(ex.sets) && ex.sets.length > 0) {
      out.push({ workout: w, exercise: ex });
    }
  }
  out.sort((a, b) => String(a.workout.date).localeCompare(String(b.workout.date)) || (a.workout.id - b.workout.id));
  return out;
}

export function normName(n) {
  return String(n || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} exercise — элемент программы: { id, name, target_sets, target_reps, cardio, knee_sensitive,
 *   no_progression, step, per_hand, warmup }
 * @param {Array} workouts — все тренировки (любой порядок), каждая: { id, date, type, pain, exercises:[{name, program_id, sets:[{w,r}]}] }
 * @param {object} opts — { adaptation: boolean } — адаптационный период (2 рабочих подхода)
 * @returns {null | { first: true, note } | { w, sets, reps, note, warmup?, rule }}
 */
export function suggest(exercise, workouts, opts = {}) {
  if (!exercise || exercise.cardio) return null;
  const targetSets = Number(exercise.target_sets) || 3;
  const targetReps = Number(exercise.target_reps) || 12;
  const sets = opts.adaptation ? Math.min(2, targetSets) : targetSets;

  const sessions = sessionsFor(exercise, workouts);
  if (sessions.length === 0) {
    return { first: true, sets, reps: targetReps, note: 'Первый раз: подбери вес так, чтобы все повторы давались с запасом ~2 повтора' };
  }
  const last = sessions[sessions.length - 1];
  const w = workingWeight(last.exercise.sets);
  if (w === 0) return null; // упражнение без веса — рекомендации нет

  const step = Number(exercise.step) || 2.5;
  const pain = Number(last.workout.pain);
  const painKnown = Number.isFinite(pain);
  const knee = !!exercise.knee_sensitive;

  const workSets = last.exercise.sets.filter((s) => Number(s.w) === w);
  const allDone =
    last.exercise.sets.length >= targetSets && workSets.every((s) => Number(s.r) >= targetReps);

  const base = { sets, reps: targetReps, step };
  const withWarmup = (r) => (exercise.warmup ? { ...r, warmup: Math.max(step, roundToStep(r.w * 0.6, step)) } : r);

  if (knee && painKnown && pain >= 6) {
    return withWarmup({ ...base, w: floorToStep(w * 0.7, step), note: 'колено 6+ — минус 30%', rule: 'pain6' });
  }
  if (knee && painKnown && pain >= 4) {
    return withWarmup({ ...base, w: floorToStep(w * 0.85, step), note: 'колено 4–5 — минус 15%', rule: 'pain4' });
  }
  if (exercise.no_progression) {
    return withWarmup({ ...base, w, note: 'закрепляем, вес не добавляем', rule: 'hold' });
  }
  if (allDone) {
    return withWarmup({ ...base, w: roundToStep(w + step, step), note: 'прошлый раз всё чисто — прибавляем', rule: 'up' });
  }
  return withWarmup({ ...base, w, note: 'закрепляем вес, добиваем повторы', rule: 'keep' });
}

/** Два раза подряд боль ≥6 — ноги только кардио, к врачу. */
export function kneeAlarm(workouts) {
  const sorted = [...workouts]
    .filter((w) => Number.isFinite(Number(w.pain)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  const n = sorted.length;
  return n >= 2 && Number(sorted[n - 1].pain) >= 6 && Number(sorted[n - 2].pain) >= 6;
}

/** Тоннаж тренировки: Σ вес × повторы (для per_hand — ×2). */
export function tonnage(workout, program) {
  let t = 0;
  for (const ex of workout.exercises || []) {
    const item = findProgramItem(program, ex);
    const mult = item?.per_hand ? 2 : 1;
    for (const s of ex.sets || []) t += (Number(s.w) || 0) * (Number(s.r) || 0) * mult;
  }
  return t;
}

export function findProgramItem(program, ex) {
  if (!program?.days) return null;
  for (const day of Object.values(program.days)) {
    const hit = day.find((p) => (ex.program_id && p.id === ex.program_id) || normName(p.name) === normName(ex.name));
    if (hit) return hit;
  }
  return null;
}

/** Следующий день по схеме A → B → A → B (C не ломает чередование). */
export function nextDayType(workouts) {
  const ab = [...workouts]
    .filter((w) => w.type === 'A' || w.type === 'B')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  if (ab.length === 0) return 'A';
  return ab[ab.length - 1].type === 'A' ? 'B' : 'A';
}
