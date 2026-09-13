import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMachineType, machineTypeLabel, machinesByType, missingTypes, MACHINE_TYPES, machineStepFor } from '../shared/machine-types.js';
import { validateProgram } from '../shared/constraints.js';
import { DEFAULT_PROGRAM } from '../shared/default-program.js';

const item = (extra = {}) => ({ id: 'x1', name: 'Тяга верхнего блока', target_sets: 3, target_reps: 12, ...extra });
const prog = (items) => ({ days: { A: items } });

test('слаги типов уникальны', () => {
  const slugs = MACHINE_TYPES.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('известный тип проходит валидацию, неизвестный — нет', () => {
  assert.deepEqual(validateProgram(prog([item({ machine_type: 'lat_pulldown' })])), []);
  const errors = validateProgram(prog([item({ machine_type: 'нет_такого' })]));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /неизвестный тип тренажёра/);
});

test('упражнение без тренажёра остаётся валидным', () => {
  assert.deepEqual(validateProgram(prog([item()])), []);
  assert.deepEqual(validateProgram(prog([item({ machine_type: '' })])), []);
});

test('стартовая программа целиком ссылается на существующие типы', () => {
  assert.deepEqual(validateProgram(DEFAULT_PROGRAM), []);
  for (const items of Object.values(DEFAULT_PROGRAM.days)) {
    for (const it of items) assert.ok(isMachineType(it.machine_type), `${it.id}: ${it.machine_type}`);
  }
});

test('machinesByType: первый экземпляр основной, остальные в alternatives', () => {
  const map = machinesByType([
    { id: 1, type: 'treadmill', name: 'Дорожка у окна' },
    { id: 2, type: 'treadmill', name: 'Дорожка в углу' },
    { id: 3, type: 'bike' },
  ]);
  assert.equal(map.treadmill.machine.id, 1);
  assert.equal(map.treadmill.alternatives.length, 1);
  assert.equal(map.bike.alternatives.length, 0);
  assert.equal(map.leg_press_seated, undefined);
});

test('machinesByType пропускает записи без типа', () => {
  assert.deepEqual(machinesByType([{ id: 1 }, null]), {});
});

test('missingTypes показывает, чего в зале нет', () => {
  const program = prog([item({ machine_type: 'lat_pulldown' }), item({ id: 'x2', machine_type: 'bike' })]);
  assert.deepEqual(missingTypes(program, [{ type: 'bike' }]), ['lat_pulldown']);
  assert.deepEqual(missingTypes(program, [{ type: 'bike' }, { type: 'lat_pulldown' }]), []);
  // зал не заведён — не хватает всего, но без дублей
  assert.deepEqual(missingTypes(prog([item({ machine_type: 'bike' }), item({ id: 'x2', machine_type: 'bike' })]), []), ['bike']);
});

test('machineTypeLabel не падает на неизвестном слаге', () => {
  assert.equal(machineTypeLabel('bike'), 'Велотренажёр');
  assert.equal(machineTypeLabel('нет_такого'), 'нет_такого');
  assert.equal(machineTypeLabel(null), '');
});

test('шаг берётся у тренажёра активного зала', () => {
  const byType = machinesByType([{ id: 1, type: 'biceps_curl', step: 5 }, { id: 2, type: 'lat_pulldown' }]);
  assert.equal(machineStepFor(byType, { machine_type: 'biceps_curl' }), 5);
  assert.equal(machineStepFor(byType, { machine_type: 'lat_pulldown' }), 0, 'шаг не задан');
  assert.equal(machineStepFor(byType, { machine_type: 'unknown' }), 0);
  assert.equal(machineStepFor({}, {}), 0);
});
