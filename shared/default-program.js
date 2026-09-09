// Программа версии 6 от 08.09.2026 (раздел 4 спеки). Используется как стартовая для новой БД.
export const DEFAULT_PROGRAM = {
  version: 1,
  schema: 'A → B → A → B… через 1–2 дня отдыха. C — опционально. Цикл 8–10 недель, потом пересмотр. Отдых 60–90 сек между подходами, ~2 мин между упражнениями.',
  days: {
    A: [
      { id: 'a1', name: 'Разминка: велотренажёр / эллипс', cardio: true, duration: '5–10 мин', machine: 'Кардио-зона; седло повыше', technique: 'Разогреть колени', photo_query: 'Matrix upright bike' },
      { id: 'a2', name: 'Жим ногами сидя (короткая амплитуда)', target_sets: 3, target_reps: 10, knee_sensitive: true, step: 5, warmup: true, machine: '«Seated Leg Press», горизонтальный, спинка вертикально; сиденье отодвинуть', technique: 'Старт ≤60–70° сгибания, стопы высоко и широко, колени в замок не выпрямлять. Боль ≤3/10 допустима, если не растёт по ходу подхода; растёт → стоп; утром хуже → −30% или пропуск', photo_query: 'Matrix seated leg press machine' },
      { id: 'a3', name: 'Сгибание ног лёжа', target_sets: 3, target_reps: 12, knee_sensitive: true, step: 5, machine: '«Prone Leg Curl», валик над пятками', technique: 'Таз прижат к подушке, пауза вверху', photo_query: 'Matrix prone leg curl machine' },
      { id: 'a4', name: 'Трицепс на блоке (канат)', target_sets: 3, target_reps: 12, step: 5, machine: 'Кроссовер, верхний блок', technique: 'Локти прижаты, работают только предплечья', photo_query: 'cable rope triceps pushdown' },
      { id: 'a5', name: 'Жим лёжа штангой', target_sets: 3, target_reps: 12, step: 5, machine: 'Скамья + штанга', technique: 'Лопатки сведены; выше 60 кг — только со страхующим', photo_query: 'barbell bench press' },
      { id: 'a6', name: 'Тяга верхнего блока', target_sets: 3, target_reps: 12, step: 5, machine: '«Lat Pulldown»', technique: 'К груди, локтями вниз, без раскачки', photo_query: 'Matrix lat pulldown machine' },
      { id: 'a7', name: 'Подъёмы на носки (икры)', target_sets: 3, target_reps: 15, step: 5, machine: '«Calf Raise» или край степа', technique: 'Колени прямые — сустав не работает', photo_query: 'Matrix calf raise machine' },
      { id: 'a8', name: 'Планка', target_sets: 3, target_reps: 25, bodyweight: true, unit: 'сек', machine: 'Коврик', technique: 'Таз не провисает; 25–30 сек', photo_query: 'plank exercise' },
    ],
    B: [
      { id: 'b1', name: 'Разминка: дорожка в горку 5–8% или вело', cardio: true, duration: '5–10 мин', machine: 'Кардио-зона', technique: '4,5–5,5 км/ч', photo_query: 'Matrix treadmill incline walk' },
      { id: 'b2', name: 'Румынская тяга с гантелями', target_sets: 3, target_reps: 12, knee_sensitive: true, per_hand: true, step: 2, machine: 'Стойка с гантелями', technique: 'Колени чуть согнуты и зафиксированы, таз назад, спина прямая, гантели до середины голени. Вес — одной гантели', photo_query: 'dumbbell romanian deadlift' },
      { id: 'b3', name: 'Разгибание ног (ограниченно)', target_sets: 2, target_reps: 15, knee_sensitive: true, no_progression: true, step: 2.5, machine: '«Leg Extension», валик спереди', technique: 'ТОЛЬКО верхняя треть амплитуды (~45° → выпрямление), лёгкий вес. Щелчки/боль → изометрия 10 сек', photo_query: 'Matrix leg extension machine' },
      { id: 'b4', name: 'Гиперэкстензия', target_sets: 3, target_reps: 12, no_progression: true, step: 2.5, machine: '«Back Extension» 45°', technique: 'До прямой линии, не переразгибаться. Вес не добавлять, пока 3×12 без веса не станут лёгкими', photo_query: '45 degree back extension bench' },
      { id: 'b5', name: 'Горизонтальная тяга', target_sets: 3, target_reps: 12, step: 5, machine: '«Seated Row» (тросовый или рычажный)', technique: 'К поясу, лопатки свести, без раскачки', photo_query: 'Matrix seated row machine' },
      { id: 'b6', name: 'Жим на плечи (рычажный)', target_sets: 3, target_reps: 12, step: 5, warmup: true, machine: '«Shoulder Press», блины на каждую ручку; рукояти на уровне ушей на старте', technique: 'Спина к спинке, поясницу не отрывать. В записи — СУММАРНЫЙ вес (шаг 2,5/сторона = 5)', photo_query: 'Matrix plate loaded shoulder press' },
      { id: 'b7', name: 'Сгибание рук в тренажёре (бицепс)', target_sets: 3, target_reps: 12, step: 2.5, machine: '«Biceps Curl»', technique: 'Локти неподвижны, опускать медленно', photo_query: 'Matrix biceps curl machine' },
      { id: 'b8', name: 'Заминка: ходьба 5 км/ч', cardio: true, duration: '3–5 мин', machine: 'Дорожка', technique: 'Дома — ИТ-тракт стоя у стены 30 сек/нога', photo_query: 'treadmill walking cooldown' },
    ],
    C: [
      { id: 'c1', name: 'Эллипс / ходьба в горку, пульс 110–130', cardio: true, duration: '30–40 мин', machine: 'Кардио-зона', technique: 'Разговорный темп', photo_query: 'Matrix elliptical' },
      { id: 'c2', name: 'Гиперэкстензия лёгкая, без веса', target_sets: 2, target_reps: 12, no_progression: true, machine: '«Back Extension» 45°', technique: 'До прямой линии', photo_query: '45 degree back extension bench' },
      { id: 'c3', name: 'Ходьба 5 км/ч, заминка', cardio: true, duration: '5 мин', machine: 'Дорожка', technique: '', photo_query: 'treadmill walking' },
    ],
  },
};

export const DEFAULT_PROFILE = {
  name: '',
  height_cm: null,
  start_weight_kg: null,
  target_weight_kg: null,
  started_at: null,
  gym_equipment: '',
  // Расписание: какие дни недели тренировочные и что в них делаем.
  // [{ dow: 1..7 (Пн..Вс), type: 'A' }] — количество тренировок в неделю = длина массива.
  schedule: [],
  adaptation_period: true,
  knee: '',
  goals: '',
  restrictions: '',
  refused: '',
  forbidden: [],
  doctor_reminder: false,
  onboarded: false,
};
