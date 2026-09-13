// Справочник типов тренажёров. Упражнение программы ссылается на ТИП,
// а конкретный экземпляр с фото живёт в зале — так программа переживает смену зала.

export const MACHINE_TYPES = [
  { slug: 'bike', label: 'Велотренажёр', group: 'Кардио' },
  { slug: 'elliptical', label: 'Эллипс', group: 'Кардио' },
  { slug: 'treadmill', label: 'Беговая дорожка', group: 'Кардио' },
  { slug: 'rower', label: 'Гребной тренажёр', group: 'Кардио' },

  { slug: 'leg_press_seated', label: 'Жим ногами сидя, горизонтальный', group: 'Ноги' },
  { slug: 'leg_press_45', label: 'Жим ногами под 45°', group: 'Ноги' },
  { slug: 'leg_curl_prone', label: 'Сгибание ног лёжа', group: 'Ноги' },
  { slug: 'leg_curl_seated', label: 'Сгибание ног сидя', group: 'Ноги' },
  { slug: 'leg_extension', label: 'Разгибание ног', group: 'Ноги' },
  { slug: 'calf_raise', label: 'Подъёмы на носки', group: 'Ноги' },
  { slug: 'hack_squat', label: 'Гакк-машина', group: 'Ноги' },

  { slug: 'lat_pulldown', label: 'Тяга верхнего блока', group: 'Спина' },
  { slug: 'seated_row', label: 'Горизонтальная тяга', group: 'Спина' },
  { slug: 'back_extension', label: 'Гиперэкстензия 45°', group: 'Спина' },
  { slug: 'pullup_assist', label: 'Гравитрон / турник', group: 'Спина' },

  { slug: 'bench_barbell', label: 'Скамья со штангой', group: 'Грудь и плечи' },
  { slug: 'chest_press', label: 'Жим от груди в тренажёре', group: 'Грудь и плечи' },
  { slug: 'pec_deck', label: 'Сведения («бабочка»)', group: 'Грудь и плечи' },
  { slug: 'shoulder_press', label: 'Жим на плечи', group: 'Грудь и плечи' },

  { slug: 'cable_crossover', label: 'Кроссовер / блок', group: 'Руки' },
  { slug: 'biceps_curl', label: 'Бицепс-машина', group: 'Руки' },
  { slug: 'triceps_machine', label: 'Трицепс-машина', group: 'Руки' },

  { slug: 'dumbbells', label: 'Гантельный ряд', group: 'Свободные веса' },
  { slug: 'barbell_rack', label: 'Стойка со штангой', group: 'Свободные веса' },
  { slug: 'smith', label: 'Машина Смита', group: 'Свободные веса' },

  { slug: 'mat', label: 'Коврик / зона для пола', group: 'Прочее' },
  { slug: 'other', label: 'Другое', group: 'Прочее' },
];

const BY_SLUG = new Map(MACHINE_TYPES.map((t) => [t.slug, t]));

export const isMachineType = (slug) => BY_SLUG.has(String(slug));
export const machineTypeLabel = (slug) => BY_SLUG.get(String(slug))?.label || String(slug || '');

/** @returns {Array<[string, typeof MACHINE_TYPES]>} типы, сгруппированные для <optgroup> */
export function machineTypeGroups() {
  const groups = new Map();
  for (const t of MACHINE_TYPES) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group).push(t);
  }
  return [...groups.entries()];
}

/**
 * Экземпляры тренажёров зала, разложенные по типу.
 * Если в зале два тренажёра одного типа — берём первый, остальные доступны через alternatives.
 * @returns {Record<string, { machine: object, alternatives: object[] }>}
 */
export function machinesByType(machines = []) {
  const out = {};
  for (const m of machines) {
    if (!m?.type) continue;
    if (out[m.type]) out[m.type].alternatives.push(m);
    else out[m.type] = { machine: m, alternatives: [] };
  }
  return out;
}

/** Типы, которые нужны программе, но которых нет в зале. */
export function missingTypes(program, machines = []) {
  const have = new Set(machines.map((m) => m.type));
  const need = new Set();
  for (const items of Object.values(program?.days || {})) {
    for (const it of items || []) if (it?.machine_type && !have.has(it.machine_type)) need.add(it.machine_type);
  }
  return [...need];
}

/** Шаг стека того тренажёра активного зала, на котором делается упражнение (0 — не задан). */
export function machineStepFor(byType, item) {
  const entry = item?.machine_type ? byType?.[item.machine_type] : null;
  const step = entry?.machine?.step ?? entry?.step;
  return Number(step) > 0 ? Number(step) : 0;
}
