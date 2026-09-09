// Расписание тренировок по дням недели.
// profile.schedule = [{ dow: 1..7 (Пн..Вс), type: 'A' }] — какие дни недели тренировочные и что в них делаем.
// Количество тренировок в неделю = длина массива.

export const DOW_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const DOW_FULL = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

/** 'YYYY-MM-DD' → день недели 1..7 (Пн=1). Даты трактуются как UTC, чтобы не съезжать по часовым поясам. */
export function dowOf(date) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  return d.getUTCDay() || 7;
}
export function addDays(date, n) {
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from, to) {
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(to).slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function normalizeSchedule(schedule) {
  if (!Array.isArray(schedule)) return [];
  const seen = new Set();
  return schedule
    .map((s) => ({ dow: Number(s?.dow), type: String(s?.type || '').trim() }))
    .filter((s) => s.dow >= 1 && s.dow <= 7 && s.type && !seen.has(s.dow) && seen.add(s.dow))
    .sort((a, b) => a.dow - b.dow);
}

export const weeklyCount = (profile) => normalizeSchedule(profile?.schedule).length;

const isDone = (w) => w && w.status !== 'skipped';
const byDate = (a, b) => String(a.date).localeCompare(String(b.date)) || (a.id || 0) - (b.id || 0);

/** Типы тренировок в порядке расписания, без повторов: ['A','B'] */
export function rotationTypes(profile, program) {
  const fromSchedule = [...new Set(normalizeSchedule(profile?.schedule).map((s) => s.type))];
  if (fromSchedule.length) return fromSchedule;
  return Object.keys(program?.days || {}).filter((d) => d !== 'C');
}

/** Следующий тип по очереди — от последней выполненной тренировки. Пропуски очередь не двигают. */
export function nextTypeInRotation(workouts, profile, program) {
  const types = rotationTypes(profile, program);
  if (types.length === 0) return null;
  const done = (workouts || []).filter(isDone).filter((w) => types.includes(w.type)).sort(byDate);
  if (done.length === 0) return types[0];
  const i = types.indexOf(done[done.length - 1].type);
  return types[(i + 1) % types.length];
}

const findWorkout = (workouts, date) => (workouts || []).find((w) => String(w.date).slice(0, 10) === date);

/**
 * Плановые дни начиная с `from`: прошедшие (для отметки пропуска) и будущие.
 * @returns [{ date, dow, planned_type, suggested_type, status }]
 *   status: done | skipped | missed | today | future
 */
export function scheduleAround(profile, workouts, program, today, { back = 14, forward = 21 } = {}) {
  const sch = normalizeSchedule(profile?.schedule);
  if (sch.length === 0) return [];
  const byDow = Object.fromEntries(sch.map((s) => [s.dow, s.type]));
  const out = [];
  const started = profile?.started_at ? String(profile.started_at).slice(0, 10) : null;
  for (let i = -back; i <= forward; i++) {
    const date = addDays(today, i);
    if (started && date < started) continue;
    const dow = dowOf(date);
    if (!byDow[dow]) continue;
    const w = findWorkout(workouts, date);
    let status;
    if (w) status = w.status === 'skipped' ? 'skipped' : 'done';
    else if (date < today) status = 'missed';
    else if (date === today) status = 'today';
    else status = 'future';
    out.push({ date, dow, planned_type: byDow[dow], status, workout_id: w?.id ?? null });
  }
  // подсказанный тип — по очереди от последней выполненной, чтобы пропуск не терял тип нагрузки
  const done = [...(workouts || [])].filter(isDone).sort(byDate);
  const types = rotationTypes(profile, program);
  let last = done.length ? done[done.length - 1].type : null;
  for (const item of out) {
    if (item.status === 'done') { last = item.planned_type; item.suggested_type = item.planned_type; continue; }
    if (item.status === 'skipped') { item.suggested_type = item.planned_type; continue; }
    const i = last ? types.indexOf(last) : -1;
    item.suggested_type = types.length ? types[(i + 1) % types.length] : item.planned_type;
    if (item.status !== 'missed') last = item.suggested_type;
  }
  return out;
}

/** Плановые дни в прошлом без записи — предложить отметить пропуск или внести задним числом. */
export function missedDays(profile, workouts, program, today, back = 14) {
  return scheduleAround(profile, workouts, program, today, { back, forward: 0 }).filter((d) => d.status === 'missed');
}

/** Ближайшая тренировка: сегодняшняя, иначе следующая по расписанию. */
export function nextPlanned(profile, workouts, program, today) {
  const all = scheduleAround(profile, workouts, program, today, { back: 0, forward: 28 });
  return all.find((d) => d.status === 'today') || all.find((d) => d.status === 'future') || null;
}

/** Сколько тренировок выполнено за последние 28 дней против плана — «держишь ли режим». */
export function adherence(profile, workouts, program, today, days = 28) {
  const planned = scheduleAround(profile, workouts, program, today, { back: days, forward: 0 })
    .filter((d) => d.status !== 'today');
  const done = planned.filter((d) => d.status === 'done').length;
  const skipped = planned.filter((d) => d.status === 'skipped').length;
  const missed = planned.filter((d) => d.status === 'missed').length;
  return { planned: planned.length, done, skipped, missed, per_week: weeklyCount(profile) };
}
