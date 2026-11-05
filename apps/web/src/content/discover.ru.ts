import { z } from 'zod';

/**
 * The texts of the screens under the landing (#discover), top to bottom: the key functions, Kiki (what she is, how her
 * mood follows the person's actions, the tamagotchi, habits, levels, bonuses), who ПроЛанч is for (искатель впечатлений /
 * ценитель времени) with the 30-second test, and the final call. The «progress and goals» block is gone (D-102).
 * Everything here is a demonstration: the numbers on the example screens are examples, and the page says so.
 */
const text = z.string().trim().min(1);

const food = z.object({
  id: z.string(),
  label: text,
  /** Change of Kiki's wellbeing (−100…100) and her experience. */
  effect: z.number(),
  xp: z.number(),
  say: text,
});

const schema = z.object({
  title: text,
  nav: z.object({ home: text, about: text, label: text }),
  features: z.object({
    eyebrow: text,
    title: text,
    items: z.array(z.object({ icon: z.string(), title: text, text })).length(6),
  }),
  kiki: z.object({
    eyebrow: text,
    title: text,
    lead: text,
    /** How her mood follows the person's actions: four moods, each with the action that brings it. */
    reacts: z.object({
      title: text,
      lead: text,
      items: z
        .array(
          z.object({
            mood: z.enum(['glow', 'good', 'tired', 'sad']),
            name: text,
            action: text,
            say: text,
          }),
        )
        .length(4),
    }),
    perks: z.array(z.object({ icon: z.string(), title: text, text })).length(4),
    stage: z.object({
      title: text,
      lead: text,
      health: text,
      level: text,
      xp: text,
      feedLabel: text,
      reset: text,
      moods: z.object({ glow: text, good: text, tired: text, sad: text }),
      greeting: text,
      foods: z.array(food).length(8),
    }),
    habits: z.object({
      title: text,
      lead: text,
      habitLabel: text,
      habits: z.array(z.object({ id: z.string(), label: text, before: z.number() })).length(3),
      weeksLabel: text,
      perWeek: text,
      daysFree: text,
      stages: z.array(z.object({ title: text, text })).length(4),
      note: text,
    }),
    levels: z.object({
      title: text,
      lead: text,
      needs: text,
      items: z.array(z.object({ name: text, text, xp: z.number() })).length(5),
    }),
    rewards: z.object({
      title: text,
      lead: text,
      soon: text,
      unit: text,
      balance: text,
      items: z.array(z.object({ icon: z.string(), title: text, text, cost: z.number() })).length(4),
      badgesTitle: text,
      badges: z.array(z.object({ icon: z.string(), title: text, text })).length(6),
    }),
  }),
  segments: z.object({
    eyebrow: text,
    title: text,
    lead: text,
    kinds: z
      .array(
        z.object({
          id: z.enum(['explorer', 'timesaver']),
          name: text,
          tagline: text,
          points: z.array(text).length(3),
        }),
      )
      .length(2),
  }),
  quiz: z.object({
    /** The big plaque: «30 секунд» is what says it is a test. */
    seconds: text,
    secondsUnit: text,
    eyebrow: text,
    title: text,
    lead: text,
    facts: z.array(text).length(3),
    start: text,
    step: text,
    questions: z.array(z.object({ text, explorer: text, timesaver: text })).length(5),
    restart: text,
    cta: text,
    ctaOpen: text,
    resultLabel: text,
    results: z.object({
      explorer: z.object({ name: text, text, chips: z.array(text).length(3) }),
      timesaver: z.object({ name: text, text, chips: z.array(text).length(3) }),
    }),
  }),
  cta: z.object({ title: text, lead: text, about: text }),
});

export const discover: DiscoverContent = {
  title: 'ПроЛанч: ключевые функции, Кики и стиль питания',
  nav: { home: 'На главную', about: 'О проекте', label: 'Разделы сайта' },

  features: {
    eyebrow: 'Ключевые функции',
    title: 'Всё, чтобы вкусно питаться и не думать об этом',
    items: [
      {
        icon: 'menu',
        title: 'Меню на неделю за минуту',
        text: 'Короткий тест о вас, режиме дня и вкусах — и готов рацион с точным КБЖУ на каждый день.',
      },
      {
        icon: 'swap',
        title: 'Замены с объяснением',
        text: 'Не нравится блюдо? Подберём замену и честно скажем, чем она подходит. Любое изменение можно отменить.',
      },
      {
        icon: 'chart',
        title: 'КБЖУ и микроэлементы',
        text: 'Нормы считаем по научным формулам, а не на глаз. Видно не только калории, но и витамины с минералами.',
      },
      {
        icon: 'box',
        title: 'Ланч-бокс в офис',
        text: 'Блюда, которые удобно взять с собой, и подсказки по вкусным местам рядом с вашим офисом.',
      },
      {
        icon: 'target',
        title: 'Привычки и цели',
        text: 'Вода, серии удачных дней, недельные цели. Всё складывается в понятный прогресс.',
      },
      {
        icon: 'shield',
        title: 'Безопасность прежде всего',
        text: 'Аллергии и ограничения учитываются жёстко. Цифры считает проверенный код, а не нейросеть.',
      },
    ],
  },

  kiki: {
    eyebrow: 'Знакомьтесь',
    title: 'Знакомьтесь, ваш личный ИИ Кики',
    lead: 'Ваш ИИ-диетолог, друг и немного тамагочи. Она живёт в приложении и растёт вместе с вашими привычками — а настроение меняет в ответ на ваши действия.',
    reacts: {
      title: 'Её настроение — отражение ваших привычек',
      lead: 'Выберите настроение и посмотрите, что к нему приводит.',
      items: [
        {
          mood: 'glow',
          name: 'Сияет',
          action: 'Вы пьёте воду, едите овощи и держитесь плана',
          say: 'Сегодня всё по плану — я сияю!',
        },
        {
          mood: 'good',
          name: 'Бодрая',
          action: 'День идёт спокойно: обед вовремя, без перекусов на бегу',
          say: 'Всё хорошо, продолжаем в том же духе.',
        },
        {
          mood: 'tired',
          name: 'Устала',
          action: 'Вы пропустили приём пищи или забыли про воду',
          say: 'Давайте вспомним про обед?',
        },
        {
          mood: 'sad',
          name: 'Грустит',
          action: 'Несколько дней подряд сладкие напитки и фастфуд',
          say: 'Скучаю по зелёному. Вернёмся мягко?',
        },
      ],
    },
    perks: [
      {
        icon: 'chat',
        title: 'Всегда на связи',
        text: 'Спросите, чем заменить блюдо или что взять в ланч-бокс, — ответ простыми словами.',
      },
      {
        icon: 'heart',
        title: 'Поддерживает, а не ругает',
        text: 'Пропустили день? Ничего страшного: Кики подскажет, как мягко вернуться в ритм.',
      },
      {
        icon: 'bell',
        title: 'Напоминает вовремя',
        text: 'О воде, обеде и перекусе — тогда, когда вам удобно, и без навязчивости.',
      },
      {
        icon: 'check',
        title: 'Говорит только проверенное',
        text: 'Числа Кики берёт из расчётов, а не придумывает. Все изменения применяете вы сами.',
      },
    ],
    stage: {
      title: 'Тамагочи, который заботится о вас',
      lead: 'Попробуйте сами: покормите Кики — и посмотрите, как еда меняет её настроение и внешний вид. В приложении то же самое происходит с тем, что вы действительно съели.',
      health: 'Самочувствие',
      level: 'Уровень',
      xp: 'Опыт',
      feedLabel: 'Что съесть?',
      reset: 'Начать сначала',
      moods: {
        glow: 'Сияет',
        good: 'Бодрая',
        tired: 'Устала',
        sad: 'Грустит',
      },
      greeting: 'Привет! Чем сегодня пообедаем?',
      foods: [
        {
          id: 'salad',
          label: 'Салат',
          effect: 14,
          xp: 20,
          say: 'Хрустяще! Овощи — мои любимые.',
        },
        {
          id: 'water',
          label: 'Вода',
          effect: 9,
          xp: 10,
          say: 'Водичка — и сразу свежее!',
        },
        {
          id: 'fish',
          label: 'Рыба с рисом',
          effect: 16,
          xp: 25,
          say: 'Сытно и полезно. Отличный обед!',
        },
        {
          id: 'fruit',
          label: 'Фрукты',
          effect: 10,
          xp: 15,
          say: 'Сладко, и без сахара из пакетика.',
        },
        {
          id: 'cake',
          label: 'Пирожное',
          effect: -9,
          xp: 5,
          say: 'Иногда можно! Главное — в меру.',
        },
        {
          id: 'soda',
          label: 'Сладкая газировка',
          effect: -15,
          xp: 0,
          say: 'Ох, много сахара. Давайте добавим воды?',
        },
        {
          id: 'burger',
          label: 'Бургер',
          effect: -17,
          xp: 0,
          say: 'Тяжеловато. Завтра сделаем обед полегче?',
        },
        {
          id: 'chips',
          label: 'Чипсы',
          effect: -13,
          xp: 0,
          say: 'Хрустят, но сил не добавляют.',
        },
      ],
    },
    habits: {
      title: 'Привычки, от которых хочется освободиться',
      lead: 'Выберите привычку и двигайте недели: чем реже она в вашей жизни, тем лучше выглядит Кики. Мы отмечаем успехи и никогда не стыдим за срыв.',
      habitLabel: 'Привычка',
      habits: [
        { id: 'soda', label: 'Сладкие напитки', before: 7 },
        { id: 'fast', label: 'Фастфуд', before: 5 },
        { id: 'night', label: 'Поздние перекусы', before: 6 },
      ],
      weeksLabel: 'Прошло недель',
      perWeek: 'раз в неделю',
      daysFree: 'дней подряд без привычки',
      stages: [
        { title: 'Начало', text: 'Кики грустит и ждёт перемен.' },
        { title: 'Первые шаги', text: 'Привычка встречается реже — Кики оживает.' },
        { title: 'Набираем ход', text: 'Заметно бодрее, и цвет стал ярче.' },
        { title: 'Привычка позади', text: 'Кики сияет, а вы чувствуете себя лучше.' },
      ],
      note: 'Пример: цифры на экране — демонстрация. В приложении Кики учитывает то, что вы отметили сами.',
    },
    levels: {
      title: 'Уровни: Кики растёт вместе с вами',
      lead: 'За здоровые привычки вы получаете опыт. Новый уровень — новый наряд для Кики.',
      needs: 'от {xp} опыта',
      items: [
        { name: 'Росточек', text: 'Знакомство: первые записи и первая вода.', xp: 0 },
        { name: 'Кочанчик', text: 'Появился росток на макушке.', xp: 100 },
        { name: 'Хрусточка', text: 'Тёплый шарф: серия из семи дней.', xp: 250 },
        { name: 'Зелёная звезда', text: 'Звезда за стабильность и сияние.', xp: 450 },
        { name: 'Легенда грядки', text: 'Корона: привычки стали вашей нормой.', xp: 700 },
      ],
    },
    rewards: {
      title: 'Бонусы от сервиса',
      lead: 'Опыт превращается в баллы ПроЛанч — их можно потратить на приятные мелочи.',
      soon: 'Система бонусов в разработке: это демонстрация идеи.',
      unit: 'баллов',
      balance: 'В примере у вас {n} баллов',
      items: [
        {
          icon: 'crown',
          title: 'Неделя Premium',
          text: 'Редактор меню, полная статистика, ИИ без ограничений.',
          cost: 500,
        },
        {
          icon: 'shirt',
          title: 'Новые образы Кики',
          text: 'Шапки, очки, шарфы и сезонные костюмы.',
          cost: 150,
        },
        {
          icon: 'book',
          title: 'Секретные рецепты',
          text: 'Блюда от шефов для самых стойких.',
          cost: 250,
        },
        {
          icon: 'tag',
          title: 'Скидки у партнёров',
          text: 'Кафе и магазины рядом с вашим офисом.',
          cost: 350,
        },
      ],
      badgesTitle: 'Достижения',
      badges: [
        { icon: 'sprout', title: 'Первая неделя', text: 'Семь дней с ПроЛанч' },
        { icon: 'drop', title: 'Водный баланс', text: 'Норма воды семь дней подряд' },
        { icon: 'candy', title: 'Семь дней без сладкого', text: 'Сладкие напитки позади' },
        { icon: 'salad', title: 'Зелёный обед', text: 'Овощи в каждом обеде недели' },
        { icon: 'flame', title: 'Серия 30', text: 'Месяц удачных дней' },
        { icon: 'star', title: 'Звезда офиса', text: 'Позовите коллегу в ПроЛанч' },
      ],
    },
  },

  segments: {
    eyebrow: 'Для кого ПроЛанч',
    title: 'Два способа вкусно питаться на работе',
    lead: 'Мы не делим людей на «правильных» и «неправильных». Мы смотрим, как вы живёте в рабочий день, — и собираем меню под ваш ритм.',
    kinds: [
      {
        id: 'explorer',
        name: 'Искатель впечатлений',
        tagline: 'Обед — маленький праздник',
        points: [
          'Вкусные новинки рядом с вашим офисом',
          'Меню из блюд, которые вам нравятся, — без скучных повторов',
          'Любимая еда в меру: баланс вместо запретов',
        ],
      },
      {
        id: 'timesaver',
        name: 'Ценитель времени',
        tagline: 'Поесть быстро — и вернуться к делам',
        points: [
          'Быстрый ланч-бокс на работу с точным КБЖУ',
          'Привычки и цели, которые не требуют лишнего ввода',
          'Простые блюда, которые можно взять с собой',
        ],
      },
    ],
  },

  quiz: {
    seconds: '30',
    secondsUnit: 'секунд',
    eyebrow: 'Мини-тест',
    title: 'Узнайте свой стиль питания за 30 секунд',
    lead: 'Искатель впечатлений вы или ценитель времени? Ответьте на пять быстрых вопросов — и мы это покажем.',
    facts: ['5 вопросов', 'Без «правильных» ответов', 'Результат сразу'],
    start: 'Начать тест',
    step: 'Вопрос {n} из {total}',
    questions: [
      {
        text: 'Обеденный перерыв для вас —',
        explorer: 'Маленький праздник: хочется выйти и попробовать что-то новое',
        timesaver: 'Несколько минут между задачами: поесть и вернуться',
      },
      {
        text: 'Вы проголодались в разгар недели. Вы…',
        explorer: 'Загляну в новое место, о котором все говорят',
        timesaver: 'Достану ланч-бокс: всё уже с собой',
      },
      {
        text: 'Что в еде важнее всего?',
        explorer: 'Вкус и впечатления',
        timesaver: 'Скорость и удобство',
      },
      {
        text: 'Хорошая цель по питанию —',
        explorer: 'Радоваться еде и не переедать',
        timesaver: 'Не думать о еде: пусть всё идёт по плану',
      },
      {
        text: 'В выходной вы…',
        explorer: 'Попробую новый рецепт',
        timesaver: 'Заранее приготовлю на всю неделю',
      },
    ],
    restart: 'Пройти заново',
    cta: 'Создать моё меню',
    ctaOpen: 'Открыть моё меню',
    resultLabel: 'Ваш результат',
    results: {
      explorer: {
        name: 'Вы — искатель впечатлений',
        text: 'Вы цените вкус и разнообразие. ПроЛанч соберёт меню из блюд, которые вам по душе, и подскажет, куда сходить за новинками рядом с офисом.',
        chips: ['Новинки рядом с офисом', 'Любимые блюда в меру', 'Без скучных повторов'],
      },
      timesaver: {
        name: 'Вы — ценитель времени',
        text: 'У вас мало времени, и это нормально. ПроЛанч соберёт быстрый ланч-бокс на работу, а привычки и цели будет отслеживать за вас.',
        chips: ['Ланч-бокс с собой', 'Точное КБЖУ', 'Привычки на автопилоте'],
      },
    },
  },

  cta: {
    title: 'Начните с меню — Кики уже ждёт',
    lead: 'Тест займёт пару минут, а первое меню будет готово сразу после него.',
    about: 'О проекте и команде',
  },
};

export const discoverSchema = schema;
export type DiscoverContent = z.infer<typeof schema>;
