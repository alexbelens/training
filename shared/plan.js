// План тренера на ближайшие тренировки.
// В отличие от разборов (журнал), план существует в одном экземпляре: тренер его ПЕРЕЗАПИСЫВАЕТ,
// а не добавляет новый. Это единственный источник истины для весов, которые назначил тренер.
//
// Форма: { version, created_at, author, summary, days: { A: [item], B: [item] } }
// item: { program_id, exercise, w, reps, sets, note }

import { normName } from './progression.js';

/** Упражнение плана для элемента программы: сначала по id, потом по названию. */
export function planItemFor(items, programItem) {
  if (!Array.isArray(items) || !programItem) return null;
  return (
    items.find((i) => i.program_id && i.program_id === programItem.id) ||
    items.find((i) => normName(i.exercise) === normName(programItem.name)) ||
    null
  );
}

/**
 * Израсходован ли план на день этого типа: считаем по тренировкам, записанным ПОСЛЕ выдачи плана.
 * Задним числом внесённая старая тренировка план не съедает.
 */
export function planUsedFor(plan, type, workouts) {
  if (!plan?.created_at) return false;
  const planDay = String(plan.created_at).slice(0, 10);
  return (workouts || []).some(
    (w) =>
      w.type === type &&
      w.status !== 'skipped' &&
      String(w.date).slice(0, 10) >= planDay &&
      (!w.created_at || String(w.created_at) > String(plan.created_at))
  );
}

/** 'none' — плана нет, 'active' — действует, 'used' — уже отработан. */
export function planStatus(plan, type, workouts) {
  const items = plan?.days?.[type];
  if (!plan || !Array.isArray(items) || items.length === 0) return 'none';
  return planUsedFor(plan, type, workouts) ? 'used' : 'active';
}

/** Действующий список упражнений плана для типа дня (или null). */
export function activePlanItems(plan, type, workouts) {
  return planStatus(plan, type, workouts) === 'active' ? plan.days[type] : null;
}

/** Типы дней, на которые план ещё действует. */
export function activePlanTypes(plan, workouts) {
  return Object.keys(plan?.days || {}).filter((t) => planStatus(plan, t, workouts) === 'active');
}

/**
 * Что показать пользователю по упражнению: решение тренера главнее расчёта по правилам.
 * @returns { source: 'coach'|'rules', w, reps, sets, note, warmup?, rules? }
 */
export function resolveTarget(suggestion, planItem, programItem) {
  if (planItem && Number.isFinite(Number(planItem.w))) {
    const out = {
      source: 'coach',
      w: Number(planItem.w),
      reps: Number(planItem.reps) || suggestion?.reps || programItem?.target_reps || 12,
      sets: Number(planItem.sets) || suggestion?.sets || programItem?.target_sets || 3,
      note: planItem.note || '',
    };
    if (suggestion && !suggestion.first && Number(suggestion.w) !== out.w) {
      out.rules = { w: suggestion.w, reps: suggestion.reps, sets: suggestion.sets, note: suggestion.note };
    }
    return out;
  }
  if (!suggestion || suggestion.first) return null;
  return { source: 'rules', w: suggestion.w, reps: suggestion.reps, sets: suggestion.sets, note: suggestion.note, warmup: suggestion.warmup };
}

/** Нормализация плана перед записью: выбрасывает пустые дни и мусорные позиции. */
export function normalizePlan(plan) {
  const days = {};
  for (const [day, items] of Object.entries(plan?.days || {})) {
    const clean = (Array.isArray(items) ? items : [])
      .filter((i) => i && (i.exercise || i.program_id))
      .map((i) => ({
        program_id: i.program_id || null,
        exercise: String(i.exercise || '').trim(),
        w: i.w == null || i.w === '' ? null : Number(i.w),
        reps: i.reps == null || i.reps === '' ? null : Number(i.reps),
        sets: i.sets == null || i.sets === '' ? null : Number(i.sets),
        note: i.note ? String(i.note) : '',
      }));
    if (clean.length) days[day] = clean;
  }
  return { summary: plan?.summary ? String(plan.summary) : '', days };
}
