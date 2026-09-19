// Цели: куда идём. Прогресс считается из данных, руками ничего отмечать не нужно,
// кроме целей вида «сходить к врачу».

import { sessionsFor, effectiveWeight, workingSets } from './progression.js';
import { adherence } from './schedule.js';

export const GOAL_KINDS = {
  body_weight: 'Вес тела',
  lift: 'Силовой результат',
  habit: 'Регулярность',
  health: 'Здоровье',
};

const clamp = (x) => Math.max(0, Math.min(1, x));
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

/**
 * Прогресс одной цели.
 * @returns { percent, current, target, text, done, stalled }
 */
export function goalProgress(goal, ctx = {}) {
  const { profile = {}, weights = [], workouts = [], program = null, today = null } = ctx;
  const t = goal?.target || {};

  if (goal.kind === 'body_weight') {
    const start = num(goal.start_value) ?? num(profile.start_weight_kg) ?? num(weights[0]?.kg);
    const target = num(t.kg) ?? num(profile.target_weight_kg);
    const current = num(weights[weights.length - 1]?.kg) ?? start;
    if (start == null || target == null || current == null) return empty(goal);
    const percent = start === target ? 1 : clamp((start - current) / (start - target));
    const left = Math.round((current - target) * 10) / 10;
    const pace = weightPace(weights); // кг в неделю, минус — снижение
    const weeks = pace < 0 ? Math.ceil(left / -pace) : null;
    return {
      percent, current, target, done: current <= target, pace,
      eta: weeks ? addWeeks(weights[weights.length - 1]?.date, weeks) : null,
      text: current <= target ? 'цель достигнута' : `${current} кг, осталось ${left} кг`,
      next_step: current <= target
        ? 'держим вес, дальше работаем на форму'
        : pace < 0
          ? `темп ${Math.abs(Math.round(pace * 10) / 10)} кг в неделю, при нём цель примерно через ${weeks} нед.`
          : weights.length < 2
            ? 'взвесься ещё раз — по одной точке темп не посчитать'
            : 'вес стоит: умеренный дефицит и белок 1,5–2 г на кг целевого веса',
    };
  }

  if (goal.kind === 'lift') {
    const item = findItem(program, goal.exercise_id);
    if (!item) return empty(goal);
    const sessions = sessionsFor(item, workouts);
    const current = sessions.length ? effectiveWeight(sessions[sessions.length - 1].exercise.sets) : 0;
    const start = num(goal.start_value) ?? current;
    const target = num(t.w);
    if (target == null) return empty(goal);
    const percent = target === start ? (current >= target ? 1 : 0) : clamp((current - start) / (target - start));
    // цель закрыта, только если целевой вес отработан нужным числом подходов на нужные повторы
    const done = sessions.some((s) => {
      const sets = workingSets(s.exercise.sets).filter((x) => Number(x.w) >= target);
      return sets.length >= (num(t.sets) || 1) && sets.every((x) => Number(x.r) >= (num(t.reps) || 1));
    });
    const step = Number(item.step) || 2.5;
    const stepsLeft = current > 0 ? Math.max(0, Math.ceil((target - current) / step)) : null;
    const reps = num(t.reps) || item.rep_max || item.target_reps || 12;
    const sets = num(t.sets) || item.target_sets || 3;
    return {
      percent: done ? 1 : percent, current, target, done, steps_left: stepsLeft,
      text: done ? 'цель достигнута' : `сейчас ${current} кг из ${target}`,
      next_step: done
        ? 'держим достигнутое'
        : `закрой ${sets} подхода по ${reps} на ${current || '?'} кг — тогда вес вырастет на ${step}. До цели ${stepsLeft} таких шагов`,
    };
  }

  if (goal.kind === 'habit') {
    const perWeek = num(t.per_week) || 3;
    const a = adherence(profile, workouts, program, today || new Date().toISOString().slice(0, 10), 28);
    const planned = a.planned || perWeek * 4;
    const percent = planned ? clamp(a.done / planned) : 0;
    const left = Math.max(0, planned - a.done);
    return {
      percent, current: a.done, target: planned, done: planned > 0 && a.done >= planned,
      text: `${a.done} из ${planned} за месяц`,
      stalled: a.missed >= 3,
      next_step: a.missed >= 3
        ? `${a.missed} пропуска за месяц — перенеси дни расписания на те, в которые реально получается`
        : left > 0 ? `осталось ${left} тренировок до нормы месяца` : 'норма месяца закрыта',
    };
  }

  // health — отмечается вручную
  return {
    percent: goal.done_at ? 1 : 0, current: goal.done_at ? 1 : 0, target: 1,
    done: !!goal.done_at, text: goal.done_at ? 'сделано' : 'ещё не сделано',
    next_step: goal.done_at ? 'закрыто' : (goal.note || 'отметь, когда сделаешь'),
  };
}

/** Средний темп изменения веса, кг в неделю, по последним взвешиваниям. */
export function weightPace(weights, window = 8) {
  const list = (weights || []).slice(-window);
  if (list.length < 2) return 0;
  const first = list[0], last = list[list.length - 1];
  const days = (new Date(`${last.date}T00:00:00Z`) - new Date(`${first.date}T00:00:00Z`)) / 86400000;
  if (days <= 0) return 0;
  return ((Number(last.kg) - Number(first.kg)) / days) * 7;
}

function addWeeks(date, weeks) {
  if (!date || !weeks) return null;
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function empty(goal) {
  return { percent: 0, current: null, target: null, done: !!goal?.done_at, text: 'нет данных' };
}

function findItem(program, id) {
  if (!program?.days || !id) return null;
  for (const items of Object.values(program.days)) {
    const hit = items.find((x) => x.id === id);
    if (hit) return hit;
  }
  return null;
}

/** Сколько дней осталось до срока (null — срок не задан). */
export function daysLeft(goal, today) {
  if (!goal?.target_date || !today) return null;
  const a = new Date(`${String(today).slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${String(goal.target_date).slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Сводка по всем целям — для главного экрана. */
export function goalsSummary(goals, ctx) {
  const list = (goals || []).map((g) => ({ ...g, progress: goalProgress(g, ctx) }));
  const active = list.filter((g) => !g.progress.done);
  return { list, total: list.length, done: list.length - active.length, active };
}
