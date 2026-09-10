// Валидатор программы против жёстких ограничений профиля (раздел 3 спеки).
import { normName } from './progression.js';
import { isMachineType } from './machine-types.js';

export const DEFAULT_FORBIDDEN = [
  'наклонный жим ногами',
  'жим ногами 45',
  'присед',
  'выпад',
  'прыж',
  'hip thrust',
  'ягодичный мост',
  'отведение бедра',
  'приведение бедра',
  'разгибание колена стоя',
  'tke',
  'скручивани',
];

/**
 * @returns {string[]} список ошибок (пусто — программа валидна)
 */
export function validateProgram(program, profile = {}) {
  const errors = [];
  if (!program || typeof program !== 'object' || !program.days) return ['program.days отсутствует'];
  const forbidden = (profile.forbidden || []).map(normName).filter(Boolean);
  const ids = new Set();
  for (const [day, items] of Object.entries(program.days)) {
    if (!Array.isArray(items)) { errors.push(`день ${day}: не массив`); continue; }
    items.forEach((it, i) => {
      const where = `${day}#${i + 1}`;
      if (!it || !it.name || !String(it.name).trim()) errors.push(`${where}: пустое название`);
      if (!it.id) errors.push(`${where}: нет id`);
      else if (ids.has(it.id)) errors.push(`${where}: дублируется id ${it.id}`);
      else ids.add(it.id);
      if (!it.cardio) {
        if (!(Number(it.target_sets) > 0)) errors.push(`${where}: target_sets должен быть > 0`);
        if (!(Number(it.target_reps) > 0)) errors.push(`${where}: target_reps должен быть > 0`);
      }
      if (it.machine_type && !isMachineType(it.machine_type)) errors.push(`${where}: неизвестный тип тренажёра «${it.machine_type}»`);
      const n = normName(it.name);
      for (const f of forbidden) {
        if (n.includes(f)) errors.push(`${where}: «${it.name}» попадает под запрет «${f}»`);
      }
    });
  }
  return errors;
}
