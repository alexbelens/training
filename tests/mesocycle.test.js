import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cyclePosition, sessionPosition, phaseLabel } from '../shared/mesocycle.js';

const profile = { cycle_start: '2026-09-07' };
const W = (n) => Array.from({ length: n }, (_, i) => ({ id: i, date: `2026-09-${String(8 + i).padStart(2, '0')}`, type: 'A' }));

test('блок считается в тренировках: 10 рабочих, потом 2 разгрузочные', () => {
  assert.equal(sessionPosition(profile, '2026-09-30', W(0)).session, 1);
  const p9 = sessionPosition(profile, '2026-09-30', W(9));
  assert.equal(p9.session, 10); assert.equal(p9.deload, false); assert.equal(p9.until_deload, 1);
  const p10 = sessionPosition(profile, '2026-09-30', W(10));
  assert.equal(p10.session, 11); assert.equal(p10.deload, true);
  const p12 = sessionPosition(profile, '2026-09-30', W(12));
  assert.equal(p12.session, 1); assert.equal(p12.cycle, 2, 'после разгрузки новый блок');
});

test('пропуски и сегодняшняя тренировка не сдвигают номер', () => {
  const list = [...W(3), { id: 99, date: '2026-09-20', type: 'A', status: 'skipped' }, { id: 100, date: '2026-09-30', type: 'A' }];
  assert.equal(sessionPosition(profile, '2026-09-30', list).session, 4);
});

test('без списка тренировок работает старый календарный режим', () => {
  const p = cyclePosition(profile, '2026-09-27');
  assert.equal(p.week, 3);
  assert.equal(cyclePosition({ ...profile, cycle: { mode: 'weeks' } }, '2026-09-27', W(5)).week, 3);
  assert.match(phaseLabel(sessionPosition(profile, '2026-09-30', W(4))), /Тренировка 5 из 12/);
});
