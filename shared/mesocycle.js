// Методика: тренировки идут блоками. Несколько недель нагрузка растёт (накопление),
// затем одна разгрузочная неделя — меньше подходов и вес полегче, чтобы связки и колено
// успевали восстановиться. После разгрузки начинается новый блок.

export const DEFAULT_CYCLE = { mode: 'sessions', work_sessions: 10, deload_sessions: 2, work_weeks: 4, deload_weeks: 1 };

const day = 86400000;
const parse = (d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`);

/** Понедельник недели, в которую попала дата. */
export function weekStart(date) {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() || 7) - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Где мы в блоке на заданную дату.
 * @returns { week, total, phase: 'work'|'deload', deload: boolean, cycle, weeks_left }
 */
export function cyclePosition(profile, date, workouts = null) {
  const cfg = { ...DEFAULT_CYCLE, ...(profile?.cycle || {}) };
  // По умолчанию блок считается в тренировках, а не в неделях: при плавающем графике
  // календарная разгрузка приходит случайно — то через 6 занятий, то через 12.
  if (cfg.mode !== 'weeks' && Array.isArray(workouts)) return sessionPosition(profile, date, workouts, cfg);
  const total = Math.max(1, Number(cfg.work_weeks) || 4) + Math.max(0, Number(cfg.deload_weeks) || 0);
  const from = profile?.cycle_start || profile?.started_at;
  if (!from) return { week: 1, total, phase: 'work', deload: false, cycle: 1, weeks_left: total - 1, configured: false };

  const weeks = Math.floor((parse(weekStart(date)) - parse(weekStart(from))) / (7 * day));
  if (weeks < 0) return { week: 1, total, phase: 'work', deload: false, cycle: 1, weeks_left: total - 1, configured: true };
  const week = (weeks % total) + 1;
  const deload = week > (Number(cfg.work_weeks) || 4);
  return {
    week, total, cycle: Math.floor(weeks / total) + 1,
    phase: deload ? 'deload' : 'work', deload,
    weeks_left: total - week,
    configured: true,
  };
}

/**
 * Позиция в блоке по количеству выполненных тренировок с начала блока.
 * «Следующая» тренировка — та, что будет сделана сегодня, её номер = сделано + 1.
 */
export function sessionPosition(profile, date, workouts, cfg = DEFAULT_CYCLE) {
  const work = Math.max(1, Number(cfg.work_sessions) || 10);
  const total = work + Math.max(0, Number(cfg.deload_sessions) || 0);
  const from = String(profile?.cycle_start || profile?.started_at || '').slice(0, 10);
  const day = String(date).slice(0, 10);
  const done = (workouts || []).filter((w) => w.status !== 'skipped')
    .filter((w) => { const d = String(w.date).slice(0, 10); return (!from || d >= from) && d < day; }).length;
  const index = done % total;            // сколько уже сделано в текущем блоке
  const session = index + 1;             // номер предстоящей тренировки в блоке
  const deload = session > work;
  return {
    mode: 'sessions', session, total, cycle: Math.floor(done / total) + 1,
    phase: deload ? 'deload' : 'work', deload,
    left: total - session, until_deload: deload ? 0 : work - session + 1,
    configured: !!from,
  };
}

/** Человеческая подпись фазы. */
export function phaseLabel(pos) {
  if (!pos) return '';
  if (pos.mode === 'sessions') {
    return pos.deload
      ? `Разгрузка: тренировка ${pos.session} из ${pos.total} — вес ниже, подходов меньше`
      : `Тренировка ${pos.session} из ${pos.total} в блоке, до разгрузки ${pos.until_deload}`;
  }
  return pos.deload
    ? `Разгрузочная неделя ${pos.week} из ${pos.total}: вес ниже, подходов меньше`
    : `Неделя ${pos.week} из ${pos.total}, работаем в рост`;
}
