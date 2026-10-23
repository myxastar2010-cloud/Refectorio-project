import type { SiteContent } from './schema';

/**
 * All user-facing text of the site (see .claude/rules/content.md).
 * 17.10: the team asked for new, «selling» slogans — the site sells the goal, not the menu — and for the «Цены»
 * block (plans from the project's business model). The texts of part 1 and of the project card are therefore new
 * (part 1 rewritten by the team on 22.10, D-052, as on their screenshots); the rest keeps the mockups with typos fixed («Ясинский
 * алексей» → «Ясинский Алексей», «Название Проекта» → «Refectorio»).
 */
export const site = {
  meta: {
    lang: 'ru',
    title: 'Refectorio — максимум результата, минимум усилий',
    description:
      'Refectorio возьмёт на себя планирование вашего меню: худейте без диет или просто питайтесь вовремя. Расчёт по науке, ИИ-консультант и меню под вас.',
  },
  brand: {
    name: 'Refectorio',
    logoIcon: 'apple',
  },
  hero: {
    aboutButton: 'О проекте',
    pricingButton: 'Цены',
    titleLines: ['Максимум результата,', 'минимум усилий'],
    leadLines: [
      'Refectorio возьмёт на себя планирование вашего меню.',
      'Худейте без диет или просто питайтесь вовремя, даже',
      'если весь день не встаёте из-за стола',
    ],
    cta: { label: 'Создать меню', href: '#quiz' },
    featuresLabel: 'Возможности Refectorio',
    features: [
      {
        title: 'Исследования',
        textLines: ['Используем доказательную', 'нутрициологию в основе', 'алгоритма'],
        icon: 'school',
      },
      {
        title: 'ИИ-консультант',
        textLines: [
          'Всегда на связи, чтобы давать',
          'советы и держать вашу',
          'мотивацию на максимуме',
        ],
        icon: 'sparkles',
      },
      {
        title: 'Ваш комфорт',
        textLines: [
          'Точный расчёт КБЖУ, соберём',
          'вкусный ланч на работу',
          'с заботой о вашем здоровье',
        ],
        icon: 'listDetails',
      },
      {
        title: 'Честность',
        textLines: ['Открытый код, а данные', 'остаются только у вас'],
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
      nameLines: ['Refectorio'],
      leadLines: ['Ваша цель —', 'наше меню'],
      logoAlt: 'Логотип Refectorio — яблоко',
      links: [{ label: 'Исходный код' }, { label: 'Документация' }],
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
