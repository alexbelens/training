// Методика: тренировки идут блоками. Несколько недель нагрузка растёт (накопление),
// затем одна разгрузочная неделя — меньше подходов и вес полегче, чтобы связки и колено
// успевали восстановиться. После разгрузки начинается новый блок.

export const DEFAULT_CYCLE = { work_weeks: 4, deload_weeks: 1 };

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
export function cyclePosition(profile, date) {
  const cfg = { ...DEFAULT_CYCLE, ...(profile?.cycle || {}) };
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

/** Человеческая подпись фазы. */
export function phaseLabel(pos) {
  if (!pos) return '';
  return pos.deload
    ? `Разгрузочная неделя ${pos.week} из ${pos.total}: вес ниже, подходов меньше`
    : `Неделя ${pos.week} из ${pos.total}, работаем в рост`;
}
