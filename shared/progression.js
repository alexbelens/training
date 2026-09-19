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
    if (w.status === 'skipped') continue; // пропущенная тренировка не влияет на прогрессию
    const ex = (w.exercises || []).find(
      (e) => (exercise.id && e.program_id === exercise.id) || normName(e.name) === name
    );
    if (ex?.skipped) continue; // пропущенное упражнение прогрессию не двигает
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
 *   no_progression, step, per_hand, per_side, warmup }
 * @param {Array} workouts — все тренировки (любой порядок), каждая: { id, date, type, pain, exercises:[{name, program_id, sets:[{w,r}]}] }
 * @param {object} opts — { adaptation: boolean } — адаптационный период (2 рабочих подхода)
 * @returns {null | { first: true, note } | { w, sets, reps, note, warmup?, rule }}
 */

/**
 * Диапазон повторов упражнения. Двойная прогрессия живёт им: пока верх диапазона
 * не закрыт во всех рабочих подходах, вес не растёт.
 */
export function repRange(exercise) {
  const min = Number(exercise?.rep_min);
  const max = Number(exercise?.rep_max);
  const target = Number(exercise?.target_reps) || 12;
  if (min > 0 && max > 0 && max >= min) return { min, max };
  if (max > 0) return { min: max, max };
  if (min > 0) return { min, max: Math.max(min, target) };
  return { min: target, max: target };
}

/**
 * Рабочие подходы: без помеченных разминочными и без тех, что заметно легче самого
 * тяжёлого. Иначе «лесенка» 20-40-50-60 читается как работа с 60 и завышает следующий раз.
 */
export function workingSets(sets, { warmupRatio = 0.85 } = {}) {
  const withWeight = (sets || []).filter((s) => Number(s.w) > 0);
  if (withWeight.length === 0) return [];
  const top = Math.max(...withWeight.map((s) => Number(s.w)));
  return withWeight.filter((s) => !s.warmup && Number(s.w) >= top * warmupRatio);
}

/**
 * Вес, на котором реально работали: самый частый среди рабочих подходов, при равенстве — меньший.
 * Сброс 50 → 45 → 45 означает рабочий вес 45, а не 50.
 */
export function effectiveWeight(sets) {
  const work = workingSets(sets);
  if (work.length === 0) return 0;
  const counts = new Map();
  for (const s of work) counts.set(Number(s.w), (counts.get(Number(s.w)) || 0) + 1);
  let best = null, bestCount = 0;
  for (const [w, c] of counts) if (c > bestCount || (c === bestCount && w < best)) { best = w; bestCount = c; }
  return best ?? 0;
}

export function suggest(exercise, workouts, opts = {}) {
  if (!exercise || exercise.cardio) return null;
  // Шаг тренажёра важнее шага упражнения: на стеке с плитками по 5 кг веса 27,5 просто нет.
  const machineStep = Number(opts.machineStep) || 0;
  const range = repRange(exercise);
  const targetSets = Number(exercise.target_sets) || 3;
  const deload = opts.phase === 'deload';
  let sets = opts.adaptation ? Math.min(2, targetSets) : targetSets;
  if (deload) sets = Math.max(1, sets - 1);

  const sessions = sessionsFor(exercise, workouts);
  const base = { sets, reps: range.max, rep_min: range.min, rep_max: range.max };
  if (sessions.length === 0) {
    return { ...base, first: true, reps: range.min,
      note: `Первый раз: подбери вес, с которым ${range.min} повторов даются с запасом примерно в два` };
  }
  const last = sessions[sessions.length - 1];
  const w = effectiveWeight(last.exercise.sets);
  if (w === 0) return null; // упражнение без веса — рекомендации нет

  const step = machineStep > 0 ? (exercise.per_side ? machineStep / 2 : machineStep) : (Number(exercise.step) || 2.5);
  const pain = Number(last.workout.pain);
  const painKnown = Number.isFinite(pain);
  const knee = !!exercise.knee_sensitive;

  // Двойная прогрессия: прибавляем, только когда верх диапазона закрыт во всех рабочих подходах.
  const work = workingSets(last.exercise.sets).filter((s) => Number(s.w) === w);
  const closed = work.length >= targetSets && work.every((s) => Number(s.r) >= range.max);
  const bestReps = work.length ? Math.max(...work.map((s) => Number(s.r) || 0)) : 0;

  const prevReps = work.map((x) => Number(x.r) || 0).filter((n) => n > 0);
  const withStep = { ...base, step, prev_reps: prevReps };
  const withWarmup = (r) => (exercise.warmup ? { ...r, warmup: Math.max(step, roundToStep(r.w * 0.6, step)) } : r);

  const gap = layoffDays(last.workout.date, opts.today);
  const layoff = layoffFactor(gap);

  let painFactor = 1, painNote = null, painRule = null;
  if (knee && painKnown && pain >= 6) { painFactor = 0.7; painNote = 'колено 6+ — минус 30%'; painRule = 'pain6'; }
  else if (knee && painKnown && pain >= 4) { painFactor = 0.85; painNote = 'колено 4–5 — минус 15%'; painRule = 'pain4'; }

  const deloadFactor = deload ? 0.9 : 1;
  const factor = Math.min(painFactor, layoff.factor, deloadFactor);

  if (factor < 1) {
    const reason = factor === painFactor ? painNote
      : factor === layoff.factor ? layoff.note
      : 'разгрузочная неделя — вес ниже, подходов меньше';
    const rule = factor === painFactor ? (painRule || 'pain') : factor === layoff.factor ? 'layoff' : 'deload';
    return withWarmup({ ...withStep, w: floorToStep(w * factor, step), reps: range.max, note: reason, rule, gap_days: gap });
  }
  if (exercise.no_progression) {
    return withWarmup({ ...withStep, w, reps: range.max, note: 'вес держим, растим только повторы', rule: 'hold', gap_days: gap });
  }
  if (closed) {
    // новый вес — ждём низ диапазона, прошлые повторы к нему не относятся
    return withWarmup({ ...withStep, prev_reps: [], w: roundToStep(w + step, step), reps: range.min,
      note: `${range.max} повторов закрыты во всех подходах — прибавляем, повторы падают к ${range.min}`, rule: 'up', gap_days: gap });
  }
  const left = range.max > range.min && bestReps ? ` (лучший подход был на ${bestReps})` : '';
  return withWarmup({ ...withStep, w, reps: range.max,
    note: `тот же вес, цель — ${range.max} повторов в каждом подходе${left}`, rule: 'keep', gap_days: gap });
}

/** Сколько дней прошло с последней сессии по упражнению (null, если сегодняшняя дата не передана). */
export function layoffDays(lastDate, today) {
  if (!today || !lastDate) return null;
  const a = new Date(`${String(lastDate).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(today).slice(0, 10)}T00:00:00Z`);
  const d = Math.round((b - a) / 86400000);
  return d >= 0 ? d : null;
}

/** Детренированность после паузы: чем длиннее перерыв, тем осторожнее возвращаемся. */
export function layoffFactor(gapDays) {
  if (gapDays == null) return { factor: 1, note: null };
  if (gapDays >= 56) return { factor: 0.6, note: `перерыв ${gapDays} дн. — начинаем заново, минус 40%` };
  if (gapDays >= 35) return { factor: 0.8, note: `перерыв ${gapDays} дн. — минус 20%` };
  if (gapDays >= 21) return { factor: 0.9, note: `перерыв ${gapDays} дн. — минус 10%` };
  return { factor: 1, note: null };
}

/** Два раза подряд боль ≥6 — ноги только кардио, к врачу. */
export function kneeAlarm(workouts) {
  const sorted = [...workouts]
    .filter((w) => Number.isFinite(Number(w.pain)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  const n = sorted.length;
  return n >= 2 && Number(sorted[n - 1].pain) >= 6 && Number(sorted[n - 2].pain) >= 6;
}

/**
 * В чём измеряется вес упражнения. Гантели — вес одной штуки, рычажные тренажёры с блинами
 * на каждой ручке — вес одной стороны. И то, и другое в сумме даёт вдвое больше.
 */
export function weightUnit(item) {
  if (item?.per_hand) return { label: 'кг/рука', short: '/рука', multiplier: 2, total: true };
  if (item?.per_side) return { label: 'кг/сторона', short: '/сторона', multiplier: 2, total: true };
  if (item?.bodyweight) return { label: 'доп. кг', short: '', multiplier: 1, total: false };
  return { label: 'кг', short: '', multiplier: 1, total: false };
}

/** Тоннаж тренировки: Σ вес × повторы (для веса на руку или на сторону — ×2). */
export function tonnage(workout, program) {
  let t = 0;
  if (workout?.status === 'skipped') return 0;
  for (const ex of workout.exercises || []) {
    if (ex?.skipped) continue;
    const item = findProgramItem(program, ex);
    const mult = weightUnit(item).multiplier;
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
    .filter((w) => w.status !== 'skipped')
    .filter((w) => w.type === 'A' || w.type === 'B')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id - b.id);
  if (ab.length === 0) return 'A';
  return ab[ab.length - 1].type === 'A' ? 'B' : 'A';
}
