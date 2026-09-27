import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dowOf, addDays, daysBetween, normalizeSchedule, weeklyCount,
  rotationTypes, nextTypeInRotation, scheduleAround, missedDays, nextPlanned, adherence,
} from '../shared/schedule.js';
import { suggest, layoffFactor, layoffDays } from '../shared/progression.js';

const PROGRAM = { days: { A: [], B: [], C: [] } };
// Пн 07.09.2026 … Вс 13.09.2026
const MON = '2026-09-07', TUE = '2026-09-08', THU = '2026-09-10', FRI = '2026-09-11';
const profile = (dows, types = ['A', 'B', 'A']) => ({ schedule: dows.map((d, i) => ({ dow: d, type: types[i % types.length] })) });
const w = (date, type, extra = {}) => ({ id: Date.parse(date), date, type, exercises: [], ...extra });

test('дни недели считаются по ISO: понедельник = 1', () => {
  assert.equal(dowOf(MON), 1);
  assert.equal(dowOf('2026-09-13'), 7);
  assert.equal(addDays(MON, 3), THU);
  assert.equal(daysBetween(MON, FRI), 4);
});

test('расписание нормализуется: сортировка, дубли дней и мусор отбрасываются', () => {
  const s = normalizeSchedule([{ dow: 4, type: 'B' }, { dow: 1, type: 'A' }, { dow: 1, type: 'B' }, { dow: 9, type: 'A' }, { dow: 3 }]);
  assert.deepEqual(s, [{ dow: 1, type: 'A' }, { dow: 4, type: 'B' }]);
  assert.equal(weeklyCount({ schedule: s }), 2);
  assert.equal(weeklyCount({}), 0);
});

test('типы ротации берутся из расписания без повторов', () => {
  assert.deepEqual(rotationTypes(profile([1, 3, 5]), PROGRAM), ['A', 'B']);
  assert.deepEqual(rotationTypes({}, PROGRAM), ['A', 'B']); // C не входит в чередование
});

test('очередь типов: следующая после выполненной A — это B', () => {
  const p = profile([1, 4]);
  assert.equal(nextTypeInRotation([], p, PROGRAM), 'A');
  assert.equal(nextTypeInRotation([w(MON, 'A')], p, PROGRAM), 'B');
  assert.equal(nextTypeInRotation([w(MON, 'A'), w(THU, 'B')], p, PROGRAM), 'A');
});

test('пропущенная тренировка не двигает очередь типов', () => {
  const p = profile([1, 4]);
  const hist = [w(MON, 'A'), w(THU, 'B', { status: 'skipped' })];
  assert.equal(nextTypeInRotation(hist, p, PROGRAM), 'B', 'после пропуска B её и надо сделать');
});

test('scheduleAround размечает статусы: done, skipped, missed, today, future', () => {
  const p = profile([1, 4]); // Пн, Чт
  const hist = [w(MON, 'A'), w('2026-09-03', 'B', { status: 'skipped' })];
  const days = scheduleAround(p, hist, PROGRAM, FRI, { back: 14, forward: 7 });
  const map = Object.fromEntries(days.map((d) => [d.date, d.status]));
  assert.equal(map[MON], 'done');
  assert.equal(map['2026-09-03'], 'skipped');
  assert.equal(map[THU], 'missed', 'четверг прошёл без записи');
  assert.equal(map['2026-09-14'], 'future');
  assert.ok(!map[FRI], 'пятница не тренировочный день');
});

test('сегодняшний тренировочный день помечается today', () => {
  const days = scheduleAround(profile([1, 4]), [], PROGRAM, THU, { back: 0, forward: 0 });
  assert.equal(days[0].status, 'today');
  assert.equal(days[0].planned_type, 'B');
});

test('после пропуска подсказанный тип отличается от планового', () => {
  const p = profile([1, 4]); // Пн=A, Чт=B
  const hist = [w(MON, 'A'), w(THU, 'B', { status: 'skipped' })];
  const next = nextPlanned(p, hist, PROGRAM, FRI);
  assert.equal(next.date, '2026-09-14');
  assert.equal(next.planned_type, 'A', 'по расписанию понедельник — это A');
  assert.equal(next.suggested_type, 'B', 'но B пропущена, догоняем её');
});

test('missedDays находит только прошедшие плановые дни без записи', () => {
  const missed = missedDays(profile([1, 4]), [w(MON, 'A')], PROGRAM, FRI, 14);
  assert.deepEqual(missed.map((m) => m.date), ['2026-08-31', '2026-09-03', THU]);
});

test('тренировки до старта программы в расписание не попадают', () => {
  const p = { ...profile([1, 4]), started_at: MON };
  const days = scheduleAround(p, [], PROGRAM, FRI, { back: 21, forward: 0 });
  assert.ok(days.every((d) => d.date >= MON));
});

test('adherence считает выполненные, пропущенные и забытые', () => {
  const p = profile([1, 4]);
  const hist = [w(MON, 'A'), w('2026-09-03', 'B', { status: 'skipped' })];
  const a = adherence(p, hist, PROGRAM, FRI, 14);
  assert.equal(a.per_week, 2);
  assert.equal(a.done, 1);
  assert.equal(a.skipped, 1);
  assert.ok(a.missed >= 1);
});

test('коэффициент детренированности растёт с длиной паузы', () => {
  assert.equal(layoffFactor(null).factor, 1);
  assert.equal(layoffFactor(7).factor, 1);
  assert.equal(layoffFactor(14).factor, 1, 'две недели — ещё не потеря формы');
  assert.equal(layoffFactor(21).factor, 0.9);
  assert.equal(layoffFactor(40).factor, 0.8);
  assert.equal(layoffFactor(60).factor, 0.6);
  assert.equal(layoffDays('2026-09-01', '2026-09-15'), 14);
  assert.equal(layoffDays('2026-09-01', null), null);
});

const press = { id: 'a5', name: 'Жим лёжа штангой', target_sets: 3, target_reps: 12, step: 5 };
const clean = [{ id: 1, date: '2026-08-01', type: 'A', exercises: [{ name: 'Жим лёжа штангой', done: true, sets: [{ w: 50, r: 12 }, { w: 50, r: 12 }, { w: 50, r: 12 }] }] }];

test('без перерыва вес растёт, после паузы — снижается', () => {
  assert.equal(suggest(press, clean, { today: '2026-08-04' }).w, 55);
  assert.equal(suggest(press, clean, { today: '2026-08-25' }).rule, 'layoff');
  assert.equal(suggest(press, clean, { today: '2026-08-25' }).w, 45); // 24 дня → −10%
  assert.equal(suggest(press, clean, { today: '2026-10-01' }).w, 30); // 61 день → −40%
});


test('пропущенная тренировка не берётся как последняя сессия', () => {
  const hist = [
    ...clean,
    { id: 2, date: '2026-08-04', type: 'A', status: 'skipped', exercises: [] },
  ];
  const r = suggest(press, hist, { today: '2026-08-05' });
  assert.equal(r.w, 55, 'ориентируемся на последнюю реально выполненную');
});

// ---------- гибкий режим: N раз в неделю в любые дни ----------
const flex = { schedule_mode: 'flexible', per_week: 2, started_at: '2026-09-01' };
const PROG = { days: { A: [], B: [], C: [] } };

test('гибкий режим: пропусков нет по определению', () => {
  const hist = [w('2026-09-10', 'A'), w('2026-09-13', 'B')];
  assert.deepEqual(missedDays(flex, hist, PROG, '2026-09-27', 30), []);
  assert.deepEqual(scheduleAround(flex, hist, PROG, '2026-09-27'), []);
  assert.equal(adherence(flex, hist, PROG, '2026-09-27').missed, 0);
});

test('гибкий режим: счёт за неделю и следующий тип по очереди', () => {
  const hist = [w('2026-09-19', 'A'), w('2026-09-24', 'B')];
  const n = nextPlanned(flex, hist, PROG, '2026-09-27'); // воскресенье той же недели, что и среда 24-е
  assert.equal(n.flexible, true);
  assert.equal(n.suggested_type, 'A', 'после B идёт A');
  assert.equal(n.week_done, 1);
  assert.equal(n.week_left, 1);
  assert.equal(n.status, 'today');
});

test('гибкий режим: сделанная сегодня тренировка закрывает день', () => {
  const hist = [w('2026-09-24', 'B'), w('2026-09-27', 'A')];
  const n = nextPlanned(flex, hist, PROG, '2026-09-27');
  assert.equal(n.status, 'done');
  assert.equal(n.week_done, 2);
  assert.equal(n.week_left, 0);
});

test('гибкий режим: норма за месяц считается от количества в неделю', () => {
  const hist = [w('2026-09-10', 'A'), w('2026-09-13', 'B'), w('2026-09-19', 'A'), w('2026-09-24', 'B')];
  const a = adherence(flex, hist, PROG, '2026-09-27', 28);
  assert.equal(a.planned, 8);
  assert.equal(a.done, 4);
  assert.equal(a.flexible, true);
  assert.equal(weeklyCount(flex), 2);
});
