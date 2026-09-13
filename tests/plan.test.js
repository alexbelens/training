import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planItemFor, planUsedFor, planStatus, activePlanItems, activePlanTypes, resolveTarget, normalizePlan } from '../shared/plan.js';

const plan = {
  created_at: '2026-09-10T16:51:00.000Z',
  summary: 'после перерыва осторожнее',
  days: {
    A: [{ program_id: 'a2', exercise: 'Жим ногами сидя (короткая амплитуда)', w: 60, reps: 12, sets: 2, note: 'без лесенки' }],
    B: [{ program_id: 'b2', exercise: 'Румынская тяга с гантелями', w: 12, reps: 12, sets: 3 }],
  },
};
const wk = (date, type, created_at, extra = {}) => ({ id: Date.parse(date), date, type, created_at, status: 'done', exercises: [], ...extra });

test('позиция плана находится по id, а при его отсутствии по названию', () => {
  assert.equal(planItemFor(plan.days.A, { id: 'a2', name: 'что угодно' })?.w, 60);
  assert.equal(planItemFor(plan.days.A, { id: 'zz', name: 'жим ногами сидя (короткая амплитуда)' })?.w, 60);
  assert.equal(planItemFor(plan.days.A, { id: 'zz', name: 'Планка' }), null);
});

test('план действует, пока тренировка этого типа не выполнена', () => {
  assert.equal(planStatus(plan, 'A', []), 'active');
  assert.equal(planStatus(plan, 'A', [wk('2026-09-11', 'A', '2026-09-11T18:00:00.000Z')]), 'used');
  assert.equal(planStatus(plan, 'B', [wk('2026-09-11', 'A', '2026-09-11T18:00:00.000Z')]), 'active', 'день B ещё впереди');
});

test('пропущенная тренировка план не расходует', () => {
  const skipped = wk('2026-09-11', 'A', '2026-09-11T18:00:00.000Z', { status: 'skipped' });
  assert.equal(planStatus(plan, 'A', [skipped]), 'active');
});

test('внесённая задним числом старая тренировка план не съедает', () => {
  const old = wk('2026-09-08', 'A', '2026-09-12T10:00:00.000Z'); // запись создана позже плана, но дата раньше
  assert.equal(planUsedFor(plan, 'A', [old]), false);
});

test('без плана статус none, активные типы считаются корректно', () => {
  assert.equal(planStatus(null, 'A', []), 'none');
  assert.equal(planStatus({ created_at: '2026-09-10T00:00:00Z', days: { A: [] } }, 'A', []), 'none');
  assert.deepEqual(activePlanTypes(plan, []), ['A', 'B']);
  assert.deepEqual(activePlanTypes(plan, [wk('2026-09-11', 'A', '2026-09-11T18:00:00.000Z')]), ['B']);
  assert.equal(activePlanItems(plan, 'A', [])?.[0].w, 60);
});

test('решение тренера важнее расчёта, расхождение показывается отдельно', () => {
  const sugg = { w: 65, reps: 12, sets: 3, note: 'прошлый раз всё чисто — прибавляем' };
  const r = resolveTarget(sugg, plan.days.A[0], { id: 'a2', name: 'Жим', target_reps: 10, target_sets: 3 });
  assert.equal(r.source, 'coach');
  assert.equal(r.w, 60);
  assert.equal(r.sets, 2);
  assert.deepEqual(r.rules, { w: 65, reps: 12, sets: 3, note: 'прошлый раз всё чисто — прибавляем' });
});

test('когда тренер и правила совпали, расхождение не показывается', () => {
  const r = resolveTarget({ w: 60, reps: 12, sets: 2, note: 'закрепляем' }, plan.days.A[0], null);
  assert.equal(r.source, 'coach');
  assert.equal(r.rules, undefined);
});

test('без плана берётся расчёт по правилам', () => {
  const r = resolveTarget({ w: 55, reps: 12, sets: 3, note: 'прибавляем', warmup: 35 }, null, null);
  assert.equal(r.source, 'rules');
  assert.equal(r.warmup, 35);
  assert.equal(resolveTarget({ first: true, note: 'подбери вес' }, null, null), null);
  assert.equal(resolveTarget(null, null, null), null);
});

test('позиция плана без веса не перебивает расчёт', () => {
  const r = resolveTarget({ w: 50, reps: 12, sets: 3, note: 'x' }, { exercise: 'Жим', note: 'следи за техникой' }, null);
  assert.equal(r.source, 'rules');
  assert.equal(r.w, 50);
});

test('нормализация плана чистит мусор и пустые дни', () => {
  const p = normalizePlan({ summary: ' ок ', days: { A: [{ exercise: 'Жим', w: '60', reps: '12', sets: '2' }, {}, null], B: [], C: [{ program_id: 'c1' }] } });
  assert.deepEqual(Object.keys(p.days), ['A', 'C']);
  assert.deepEqual(p.days.A, [{ program_id: null, exercise: 'Жим', w: 60, reps: 12, sets: 2, note: '' }]);
});
