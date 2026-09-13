import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, kneeAlarm, tonnage, nextDayType, roundToStep, weightUnit } from '../shared/progression.js';
import { validateProgram, DEFAULT_FORBIDDEN } from '../shared/constraints.js';
import { DEFAULT_PROGRAM } from '../shared/default-program.js';

const legPress = { id: 'a2', name: 'Жим ногами сидя (короткая амплитуда)', target_sets: 3, target_reps: 10, knee_sensitive: true, step: 5, warmup: true };
const legCurl = { id: 'a3', name: 'Сгибание ног лёжа', target_sets: 3, target_reps: 12, knee_sensitive: true, step: 5 };
const triceps = { id: 'a4', name: 'Трицепс на блоке (канат)', target_sets: 3, target_reps: 12, step: 5 };
const bench = { id: 'a5', name: 'Жим лёжа штангой', target_sets: 3, target_reps: 12, step: 5 };
const lat = { id: 'a6', name: 'Тяга верхнего блока', target_sets: 3, target_reps: 12, step: 5 };
const hyper = { id: 'b4', name: 'Гиперэкстензия', target_sets: 3, target_reps: 12, no_progression: true };
const rdl = { id: 'b2', name: 'Румынская тяга с гантелями', target_sets: 3, target_reps: 12, knee_sensitive: true, per_hand: true, step: 2 };
const cardio = { id: 'a1', name: 'Разминка', cardio: true };

const wk = (date, type, pain, exercises, id = Date.parse(date)) => ({ id, date, type, pain, exercises });
const ex = (name, sets) => ({ name, done: true, sets });

test('округление до шага', () => {
  assert.equal(roundToStep(38.5), 37.5);
  assert.equal(roundToStep(39), 40);
  assert.equal(roundToStep(52.3, 5), 50);
});

test('кардио — без рекомендации', () => {
  assert.equal(suggest(cardio, []), null);
});

test('первая тренировка — first', () => {
  const r = suggest(legPress, []);
  assert.equal(r.first, true);
  assert.equal(r.sets, 3);
  assert.match(r.note, /подбери вес/);
});

test('пирамида: рабочий вес = максимум, всё чисто → +шаг (5 для жима сидя)', () => {
  const hist = [wk('2026-09-05', 'A', 3, [ex('Жим ногами сидя (короткая амплитуда)', [{ w: 30, r: 10 }, { w: 40, r: 15 }, { w: 55, r: 16 }])])];
  const r = suggest(legPress, hist);
  assert.equal(r.w, 60);
  assert.equal(r.rule, 'up');
  assert.equal(r.warmup, 35); // 60% от 60 = 36 → шаг 5 → 35
});

test('адаптационный период → 2 рабочих подхода', () => {
  const hist = [wk('2026-09-05', 'A', 3, [ex('Сгибание ног лёжа', [{ w: 25, r: 12 }, { w: 25, r: 12 }, { w: 25, r: 12 }])])];
  const r = suggest(legCurl, hist, { adaptation: true });
  assert.equal(r.sets, 2);
  assert.equal(r.w, 30);
});

test('боль 4 → −15% на колено-чувствительных', () => {
  const hist = [wk('2026-09-05', 'A', 4, [ex('Жим ногами сидя (короткая амплитуда)', [{ w: 50, r: 10 }, { w: 50, r: 10 }, { w: 50, r: 10 }])])];
  const r = suggest(legPress, hist);
  assert.equal(r.w, 40); // 42.5 → шаг 5 → 40
  assert.equal(r.rule, 'pain4');
});

test('боль 4 не трогает упражнения без knee_sensitive', () => {
  const hist = [wk('2026-09-05', 'A', 4, [ex('Трицепс на блоке (канат)', [{ w: 40, r: 12 }, { w: 40, r: 12 }, { w: 40, r: 12 }])])];
  const r = suggest(triceps, hist);
  assert.equal(r.w, 45);
  assert.equal(r.rule, 'up');
});

test('боль 6 → −30%', () => {
  const hist = [wk('2026-09-05', 'A', 7, [ex('Жим ногами сидя (короткая амплитуда)', [{ w: 50, r: 10 }, { w: 50, r: 10 }, { w: 50, r: 10 }])])];
  const r = suggest(legPress, hist);
  assert.equal(r.w, 35);
  assert.equal(r.rule, 'pain6');
});

test('недожал повторы → тот же вес', () => {
  const hist = [wk('2026-09-05', 'A', 3, [ex('Тяга верхнего блока', [{ w: 20, r: 12 }, { w: 35, r: 12 }, { w: 50, r: 10 }])])];
  const r = suggest(lat, hist);
  assert.equal(r.w, 50);
  assert.equal(r.rule, 'keep');
});

test('меньше подходов, чем целевых → тот же вес', () => {
  const hist = [wk('2026-09-05', 'A', 3, [ex('Жим лёжа штангой', [{ w: 50, r: 12 }, { w: 50, r: 12 }])])];
  const r = suggest(bench, hist);
  assert.equal(r.w, 50);
  assert.equal(r.rule, 'keep');
});

test('без веса → null', () => {
  const hist = [wk('2026-09-08', 'B', 2, [ex('Гиперэкстензия', [{ w: 0, r: 10 }, { w: 0, r: 10 }, { w: 0, r: 12 }])])];
  assert.equal(suggest(hyper, hist), null);
});

test('no_progression с весом → закрепляем', () => {
  const legExt = { id: 'b3', name: 'Разгибание ног (ограниченно)', target_sets: 2, target_reps: 15, knee_sensitive: true, no_progression: true };
  const hist = [wk('2026-09-08', 'B', 2, [ex('Разгибание ног (ограниченно)', [{ w: 15, r: 15 }, { w: 15, r: 15 }])])];
  const r = suggest(legExt, hist);
  assert.equal(r.w, 15);
  assert.equal(r.rule, 'hold');
});

test('pain=null трактуется как неизвестная → прогрессия по повторам', () => {
  const hist = [wk('2026-09-08', 'B', null, [ex('Румынская тяга с гантелями', [{ w: 10, r: 12 }, { w: 10, r: 12 }, { w: 10, r: 12 }])])];
  const r = suggest(rdl, hist);
  assert.equal(r.w, 12);
});

test('берётся последняя сессия с этим упражнением, а не последняя тренировка вообще', () => {
  const hist = [
    wk('2026-09-08', 'B', 8, [ex('Гиперэкстензия', [{ w: 0, r: 10 }])]),
    wk('2026-09-05', 'A', 3, [ex('Жим ногами сидя (короткая амплитуда)', [{ w: 55, r: 16 }, { w: 55, r: 16 }, { w: 55, r: 16 }])]),
  ];
  const r = suggest(legPress, hist);
  assert.equal(r.w, 60);
});

test('сопоставление по program_id имеет приоритет над именем', () => {
  const hist = [wk('2026-09-05', 'A', 3, [{ name: 'Старое имя', program_id: 'a5', done: true, sets: [{ w: 50, r: 12 }, { w: 50, r: 12 }, { w: 50, r: 12 }] }])];
  assert.equal(suggest(bench, hist).w, 55);
});

test('kneeAlarm: две подряд ≥6', () => {
  assert.equal(kneeAlarm([wk('2026-09-05', 'A', 6, []), wk('2026-09-08', 'B', 7, [])]), true);
  assert.equal(kneeAlarm([wk('2026-09-05', 'A', 6, []), wk('2026-09-08', 'B', 3, [])]), false);
  assert.equal(kneeAlarm([wk('2026-09-08', 'B', 7, [])]), false);
});

test('тоннаж с учётом per_hand', () => {
  const w = wk('2026-09-08', 'B', 2, [
    ex('Румынская тяга с гантелями', [{ w: 10, r: 12 }]),
    ex('Гиперэкстензия', [{ w: 0, r: 10 }]),
    ex('Горизонтальная тяга', [{ w: 40, r: 12 }]),
  ]);
  assert.equal(tonnage(w, DEFAULT_PROGRAM), 10 * 12 * 2 + 40 * 12);
});

test('nextDayType чередует A/B, C не мешает', () => {
  assert.equal(nextDayType([]), 'A');
  assert.equal(nextDayType([wk('2026-09-05', 'A', 3, [])]), 'B');
  assert.equal(nextDayType([wk('2026-09-05', 'A', 3, []), wk('2026-09-08', 'B', 2, []), wk('2026-09-09', 'C', 1, [])]), 'A');
});

test('валидатор: дефолтная программа проходит запреты по умолчанию', () => {
  assert.deepEqual(validateProgram(DEFAULT_PROGRAM, { forbidden: DEFAULT_FORBIDDEN }), []);
});

test('валидатор ловит запрещённое упражнение и ошибки структуры', () => {
  const p = { days: { A: [{ id: 'x1', name: 'Наклонный жим ногами 45°', target_sets: 3, target_reps: 10 }, { id: 'x1', name: '', target_sets: 0 }] } };
  const errs = validateProgram(p, { forbidden: DEFAULT_FORBIDDEN });
  assert.ok(errs.some((e) => e.includes('запрет')));
  assert.ok(errs.some((e) => e.includes('дублируется')));
  assert.ok(errs.some((e) => e.includes('пустое название')));
  assert.ok(errs.some((e) => e.includes('target_sets')));
});

// --- пропуск отдельного упражнения ---

test('пропущенное упражнение не двигает прогрессию', () => {
  const done = wk('2026-09-01', 'A', 2, [ex(legPress.name, [{ w: 50, r: 10 }, { w: 50, r: 10 }, { w: 50, r: 10 }])]);
  const skipped = wk('2026-09-04', 'A', 2, [{ name: legPress.name, skipped: true, skip_reason: 'занят тренажёр', sets: [] }]);
  const r = suggest(legPress, [done, skipped], { today: '2026-09-05' });
  // база остаётся от 01.09 (50 кг), а не «первый раз»
  assert.equal(r.w, 55, 'прибавка считается от последней ВЫПОЛНЕННОЙ сессии');
});

test('пропуск не считается за «первый раз», если раньше упражнение делали', () => {
  const done = wk('2026-09-01', 'A', 2, [ex(legCurl.name, [{ w: 25, r: 12 }, { w: 25, r: 12 }, { w: 25, r: 12 }])]);
  const skipped = wk('2026-09-04', 'A', 2, [{ name: legCurl.name, skipped: true, sets: [] }]);
  assert.equal(suggest(legCurl, [done, skipped], { today: '2026-09-05' }).first, undefined);
});

test('пропущенное упражнение игнорируется, даже если в нём остались подходы', () => {
  const done = wk('2026-09-01', 'A', 2, [ex(bench.name, [{ w: 50, r: 12 }, { w: 50, r: 12 }, { w: 50, r: 12 }])]);
  const skipped = wk('2026-09-04', 'A', 2, [{ name: bench.name, skipped: true, sets: [{ w: 90, r: 1 }] }]);
  const r = suggest(bench, [done, skipped], { today: '2026-09-05' });
  assert.equal(r.w, 55, 'вес 90 из пропущенного упражнения не должен становиться рабочим');
});

test('тоннаж не учитывает пропущенное упражнение', () => {
  const w = wk('2026-09-04', 'A', 2, [
    ex(bench.name, [{ w: 50, r: 10 }]),
    { name: legPress.name, skipped: true, sets: [{ w: 100, r: 10 }] },
  ]);
  assert.equal(tonnage(w, DEFAULT_PROGRAM), 500);
});

test('единица веса: гантели, стороны тренажёра, свой вес', () => {
  assert.deepEqual(weightUnit({ per_hand: true }), { label: 'кг/рука', short: '/рука', multiplier: 2, total: true });
  assert.deepEqual(weightUnit({ per_side: true }), { label: 'кг/сторона', short: '/сторона', multiplier: 2, total: true });
  assert.equal(weightUnit({ bodyweight: true }).label, 'доп. кг');
  assert.equal(weightUnit({}).multiplier, 1);
  assert.equal(weightUnit(null).label, 'кг');
});

test('тоннаж считает обе стороны рычажного тренажёра', () => {
  const program = { days: { B: [{ id: 'b6', name: 'Жим на плечи (рычажный)', per_side: true }] } };
  const w = { date: '2026-09-13', type: 'B', exercises: [{ program_id: 'b6', name: 'Жим на плечи (рычажный)', sets: [{ w: 17.5, r: 12 }] }] };
  assert.equal(tonnage(w, program), 17.5 * 12 * 2);
});

test('шаг тренажёра важнее шага упражнения', () => {
  const curl = { id: 'b7', name: 'Сгибание рук', target_sets: 3, target_reps: 12, step: 2.5 };
  const hist = [{ id: 1, date: '2026-09-08', type: 'B', pain: 2, exercises: [{ name: 'Сгибание рук', done: true, sets: [{ w: 25, r: 12 }, { w: 25, r: 12 }, { w: 25, r: 12 }] }] }];
  assert.equal(suggest(curl, hist).w, 27.5, 'без тренажёра берётся шаг упражнения');
  assert.equal(suggest(curl, hist, { machineStep: 5 }).w, 30, 'на стеке с плитками по 5 кг — 30');
});

test('снижение при боли тоже укладывается в шаг тренажёра', () => {
  const press = { id: 'a2', name: 'Жим ногами', target_sets: 3, target_reps: 10, knee_sensitive: true, step: 5 };
  const hist = [{ id: 1, date: '2026-09-08', type: 'A', pain: 7, exercises: [{ name: 'Жим ногами', done: true, sets: [{ w: 60, r: 10 }, { w: 60, r: 10 }, { w: 60, r: 10 }] }] }];
  assert.equal(suggest(press, hist, { machineStep: 10 }).w, 40, '60 × 0.7 = 42 → вниз до 40');
});

test('для веса на сторону шаг тренажёра делится пополам', () => {
  const shoulder = { id: 'b6', name: 'Жим на плечи', target_sets: 3, target_reps: 12, per_side: true, step: 2.5 };
  const hist = [{ id: 1, date: '2026-09-08', type: 'B', pain: 2, exercises: [{ name: 'Жим на плечи', done: true, sets: [{ w: 15, r: 12 }, { w: 15, r: 12 }, { w: 15, r: 12 }] }] }];
  assert.equal(suggest(shoulder, hist, { machineStep: 5 }).w, 17.5, 'блин 2,5 на каждую сторону = 5 суммарно');
});
