import type { SiteContent } from './schema';

/**
 * All user-facing text of the site (see .claude/rules/content.md).
 * Part 1 follows the mockup of the rebrand (stage 4, D-060), with its typos fixed: «Refectorio» → «ПроЛанч» in the lead,
 * «ИИ консультант» → «ИИ-консультант», «твою» → «вашу» (the site says «вы»), «ланч бокс» → «ланч-бокс». The rest keeps
 * the earlier mockups with typos fixed («Ясинский алексей» → «Ясинский Алексей»); «Цены» comes from the project's business
 * model (17.10).
 */
export const site = {
  meta: {
    lang: 'ru',
    title: 'ПроЛанч — вкусно питаться, не отвлекаясь от важного',
    description:
      'ПроЛанч возьмёт на себя планирование вашего меню: худейте без диет или просто питайтесь вовремя. Расчёт по науке, ИИ-консультант и меню под вас.',
  },
  brand: {
    name: 'ПроЛанч',
    logoAlt: 'Логотип ПроЛанч — кочан капусты',
  },
  hero: {
    aboutButton: 'О проекте',
    pricingButton: 'Цены',
    titleLines: ['Вкусно питаться,', 'не отвлекаясь от важного'],
    /** What a screen reader says for the two lines: the pause between them that the layout shows. */
    titleSpoken: 'Вкусно питаться, не отвлекаясь от важного',
    leadLines: [
      'ПроЛанч возьмёт на себя планирование вашего меню.',
      'Худейте без диет или просто питайтесь вовремя, даже',
      'если весь день не встаёте из-за стола',
    ],
    cta: { label: 'Создать меню', href: '#quiz' },
    /** A menu is stored in this browser (ТЗ фаза 4 §13). */
    ctaOpen: { label: 'Открыть моё меню', href: '#menu' },
    featuresLabel: 'Возможности ПроЛанч',
    features: [
      {
        title: 'Меню за минуту',
        textLines: ['Тест о себе — и готова', 'неделя с точным КБЖУ'],
        icon: 'listDetails',
      },
      {
        title: 'Кики',
        textLines: ['Ваш ИИ-диетолог растёт', 'и меняется вместе', 'с вашими привычками'],
        icon: 'sparkles',
      },
      {
        title: 'Кайфожорам',
        textLines: ['Вкусные новинки рядом', 'с вашим офисом'],
        icon: 'mug',
      },
      {
        title: 'Торопыжкам',
        textLines: ['Быстрый ланч-бокс на', 'работу, привычки и цели'],
        icon: 'bolt',
      },
      {
        title: 'Честные цифры',
        textLines: ['Калории считает наука,', 'а не нейросеть'],
        icon: 'shieldCheck',
      },
    ],
  },
  about: {
    title: 'О проекте',
    backLabel: 'Вернуться к началу',
    team: {
      label: 'Команда:',
      nameLines: ['Modern', 'Manifesto'],
      leadLines: ['Учащиеся школы', '#2107'],
      image: 'teamLogo',
      imageAlt: 'Логотип команды Modern Manifesto',
      more: 'Подробнее',
      moreLabel: 'Подробнее о команде Modern Manifesto',
    },
    project: {
      label: 'Проект:',
      nameLines: ['ПроЛанч'],
      leadLines: ['Ваша цель —', 'наше меню'],
      more: 'Подробнее',
      moreLabel: 'Подробнее о проекте ПроЛанч',
    },
  },
  quizShell: {
    exit: 'Выйти',
    exitLabel: 'Выйти из теста',
    loading: 'Загружаем тест…',
    loadError: 'Не получилось загрузить тест. Проверьте интернет и попробуйте ещё раз.',
    retry: 'Повторить',
  },
  teamDialog: {
    nameLines: ['Modern', 'Manifesto'],
    /** Shown while the pointer is over the name — a small «translation». */
    nameTranslationLines: ['Современное', 'Проявление'],
    leadLines: ['Учащиеся школы', '#2107'],
    membersLabel: 'Участники команды',
    members: [
      ['Старостин Михаил', 'Малютин Артём', 'Устименко Милана'],
      ['Ясинский Алексей', 'Щербюк Анна'],
    ],
    close: 'Закрыть',
  },
  /** The project details card (stage 3, 4.19). Every sentence is true of the site as it is now. */
  projectDialog: {
    title: 'ПроЛанч',
    paragraphs: [
      'Сайт, который помогает поставить цель в питании — сбросить вес, набрать мышцы или удержать форму — и прийти к ней без жёстких диет.',
      'Вы выбираете цель и проходите короткий тест: о себе, режиме дня и вкусах. По ответам мы собираем меню — генерацию сейчас дорабатываем.',
      'Калории и БЖУ считаем по научным формулам, а не на глаз. Ответы теста хранятся только в вашем браузере.',
    ],
    // A no-break space: «#2107» never leaves «школа».
    teamLine: 'Проект команды Modern Manifesto, школа #2107',
    linksLabel: 'Материалы проекта',
    links: [{ label: 'Исходный код' }, { label: 'Документация' }, { label: 'Авторы фотографий' }],
    close: 'Закрыть подробности о проекте',
  },
  pricing: {
    title: 'Цены',
    heading: 'Выбирай свой темп',
    lead: 'Начинай с бесплатно — переходите на Premium, когда захочется большего',
    close: 'Закрыть цены',
    periodsLabel: 'Оплата',
    periods: { month: 'Месяц', year: 'Год', yearDiscount: '−44%' },
    plansLabel: 'Тарифы',
    choose: 'Выбрать тариф «{name}»',
    plans: [
      {
        id: 'free',
        name: 'Бесплатно',
        tagline: 'Чтобы сделать первый шаг',
        prices: {
          month: { amount: '0 ₽', per: 'навсегда' },
          year: { amount: '0 ₽', per: 'навсегда' },
        },
        features: [
          ['Тест и генератор меню'],
          ['Одно меню на неделю'],
          ['Рецепты блюд'],
          ['ИИ-помощник — 3 вопроса', 'в день'],
          ['Магазины рядом'],
        ],
      },
      {
        id: 'premium',
        name: 'Premium',
        tagline: 'Для тех, кто идёт к цели всерьёз',
        prices: {
          month: { amount: '299 ₽', per: 'в месяц' },
          year: { amount: '1990 ₽', per: 'в год' },
        },
        features: [
          ['Всё из «бесплатно»'],
          ['Редактор меню и рецептов'],
          ['Трекинг прогресса'],
          ['ИИ-помощник без', 'ограничений'],
          ['Конструктор ланч-боксов'],
        ],
      },
    ],
    more: {
      label: 'Ещё...',
      open: 'Все возможности Premium',
      close: 'Свернуть возможности Premium',
      features: [
        ['Меню для всей семьи'],
        ['Полная статистика'],
        ['Опросы для сохранения', 'мотивации'],
        ['Без рекламы'],
        ['Сканер штрихкодов'],
        ['Добавление блюд'],
        ['Трекинг питья'],
        ['Ближайшие рестораны и', 'магазины со скидками'],
        ['Персональные', 'рекомендации'],
      ],
    },
  },
  notices: {
    workingOnIt: 'Мы работаем над этим',
    noPayment: 'Это проект, тут пока нет оплаты',
    loadError: 'Не получилось открыть. Проверьте интернет и попробуйте ещё раз.',
  },
  food: {
    names: {
      strawberry: 'клубника',
      salad: 'салат',
      avocado: 'авокадо',
      broccoli: 'брокколи',
      popcorn: 'попкорн',
      hotdog: 'хот-дог',
      donut: 'пончик',
      'fried-egg': 'яичница',
      burger: 'бургер',
      cheese: 'сыр',
      corn: 'кукуруза',
      cherries: 'вишня',
      croissant: 'круассан',
      jam: 'джем',
      apple: 'яблоко',
    },
  },
} as const satisfies SiteContent;
