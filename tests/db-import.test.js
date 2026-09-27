import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// отдельная временная база для теста
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'training-test-'));
const store = await import('../server/db.js');

test('импорт с программой внутри не падает на вложенной транзакции', () => {
  const u = store.createUser({ login: 'imp', password: 'password123' });
  const out = store.importAll(u.id, {
    profile: { name: 'Тест' },
    program: { schema: 'x', days: { A: [{ id: 'a1', name: 'Жим', target_sets: 3, target_reps: 10 }] } },
    workouts: [{ id: 1, date: '2026-09-01', type: 'A', exercises: [{ name: 'Жим', sets: [{ w: 50, r: 10 }] }] }],
    weights: [{ date: '2026-09-01', kg: 100 }],
  });
  assert.equal(out.workouts.length, 1);
  assert.equal(out.program.days.A[0].name, 'Жим');
  assert.equal(out.weights.length, 1);
});

test('ошибка внутри импорта откатывает всё', () => {
  const u = store.createUser({ login: 'imp2', password: 'password123' });
  // тренировка корректная, а вес битый — упадёт на весе, тренировка тоже должна откатиться
  assert.throws(() => store.importAll(u.id, {
    workouts: [{ id: 2, date: '2026-09-02', type: 'A', exercises: [] }],
    weights: [{ date: '2026-09-02', kg: 'не число' }],
  }));
  assert.equal(store.listWorkouts(u.id).length, 0, 'тренировка не должна была сохраниться');
});
