import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, daysLeft, goalsSummary, weightPace } from '../shared/goals.js';

const program = { days: { A: [{ id: 'a5', name: 'Жим лёжа штангой', target_sets: 3, rep_min: 8, rep_max: 12 }] } };
const profile = { start_weight_kg: 115, target_weight_kg: 100, schedule: [{ dow: 2, type: 'A' }, { dow: 4, type: 'B' }], started_at: '2026-09-07' };
const wk = (date, type, sets) => ({ id: Date.parse(date), date, type, status: 'done', exercises: [{ program_id: 'a5', name: 'Жим лёжа штангой', sets }] });

test('вес тела: процент считается от старта к цели', () => {
  const g = { kind: 'body_weight', target: { kg: 100 } };
  const p = goalProgress(g, { profile, weights: [{ date: '2026-09-05', kg: 115 }, { date: '2026-09-19', kg: 112 }] });
  assert.equal(p.current, 112);
  assert.equal(p.target, 100);
  assert.ok(Math.abs(p.percent - 0.2) < 0.001, '3 кг из 15');
  assert.equal(p.done, false);
  assert.match(p.text, /осталось 12 кг/);
});

test('вес тела: цель достигнута', () => {
  const p = goalProgress({ kind: 'body_weight', target: { kg: 100 } }, { profile, weights: [{ date: '2026-09-19', kg: 99.5 }] });
  assert.equal(p.done, true);
  assert.equal(p.percent, 1);
});

test('силовая цель: прогресс от стартового веса к целевому', () => {
  const g = { kind: 'lift', exercise_id: 'a5', start_value: 60, target: { w: 80, reps: 12, sets: 3 } };
  const workouts = [wk('2026-09-10', 'A', [{ w: 65, r: 10 }, { w: 65, r: 10 }, { w: 65, r: 10 }])];
  const p = goalProgress(g, { profile, program, workouts });
  assert.equal(p.current, 65);
  assert.ok(Math.abs(p.percent - 0.25) < 0.001, '5 кг из 20');
  assert.equal(p.done, false);
});

test('силовая цель закрывается только при нужных подходах и повторах', () => {
  const g = { kind: 'lift', exercise_id: 'a5', start_value: 60, target: { w: 80, reps: 12, sets: 3 } };
  const notEnough = [wk('2026-09-10', 'A', [{ w: 80, r: 12 }, { w: 80, r: 8 }, { w: 80, r: 6 }])];
  assert.equal(goalProgress(g, { profile, program, workouts: notEnough }).done, false, 'повторы не добраны');
  const full = [wk('2026-09-10', 'A', [{ w: 80, r: 12 }, { w: 80, r: 12 }, { w: 80, r: 12 }])];
  const p = goalProgress(g, { profile, program, workouts: full });
  assert.equal(p.done, true);
  assert.equal(p.percent, 1);
});

test('регулярность считается по расписанию за месяц', () => {
  const workouts = [wk('2026-09-08', 'A', [{ w: 60, r: 10 }]), wk('2026-09-10', 'B', [{ w: 60, r: 10 }])];
  const p = goalProgress({ kind: 'habit', target: { per_week: 2 } }, { profile, program, workouts, today: '2026-09-19' });
  assert.ok(p.current >= 2);
  assert.match(p.text, /за месяц/);
});

test('цель про здоровье отмечается вручную', () => {
  assert.equal(goalProgress({ kind: 'health' }, {}).done, false);
  const p = goalProgress({ kind: 'health', done_at: '2026-09-19' }, {});
  assert.equal(p.done, true);
  assert.equal(p.percent, 1);
});

test('срок и сводка', () => {
  assert.equal(daysLeft({ target_date: '2026-10-01' }, '2026-09-19'), 12);
  assert.equal(daysLeft({}, '2026-09-19'), null);
  const s = goalsSummary([{ kind: 'health', done_at: '2026-09-19' }, { kind: 'health' }], {});
  assert.equal(s.total, 2);
  assert.equal(s.done, 1);
  assert.equal(s.active.length, 1);
});

test('у цели есть следующий шаг и ожидаемый срок', () => {
  const weights = [{ date: '2026-09-05', kg: 115 }, { date: '2026-09-19', kg: 113 }];
  const p = goalProgress({ kind: 'body_weight', target: { kg: 100 } }, { profile, weights });
  assert.ok(p.pace < 0, 'вес снижается');
  assert.ok(p.eta, 'есть ожидаемая дата');
  assert.match(p.next_step, /темп/);

  const lift = goalProgress({ kind: 'lift', exercise_id: 'a5', start_value: 60, target: { w: 80, reps: 12, sets: 3 } },
    { profile, program, workouts: [wk('2026-09-10', 'A', [{ w: 65, r: 10 }, { w: 65, r: 10 }, { w: 65, r: 10 }])] });
  assert.equal(lift.steps_left, 6, 'по 2.5 кг от 65 до 80');
  assert.match(lift.next_step, /закрой/);
});

test('темп веса считается на килограммы в неделю', () => {
  assert.equal(weightPace([{ date: '2026-09-05', kg: 115 }, { date: '2026-09-12', kg: 114 }]), -1);
  assert.equal(weightPace([{ date: '2026-09-05', kg: 115 }]), 0);
});
