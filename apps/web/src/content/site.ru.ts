import type { SiteContent } from './schema';

/**
 * All user-facing text of the site (see .claude/rules/content.md).
 * 17.10: the team asked for new, «selling» slogans — the site sells the goal, not the menu — and for the «Цены»
 * block (plans from the project's business model). The texts of part 1 and of the project card are therefore new;
 * the rest keeps the mockups with typos fixed («Ясинский алексей» → «Ясинский Алексей», «Название Проекта» →
 * «Refectorio»).
 */
export const site = {
  meta: {
    lang: 'ru',
    title: 'Refectorio — форма мечты начинается с тарелки',
    description:
      'Поставьте цель — Refectorio соберёт вкусное меню, которое к ней ведёт: расчёт по науке, ИИ-помощник и меню под вас.',
  },
  brand: {
    name: 'Refectorio',
    logoIcon: 'apple',
  },
  hero: {
    aboutButton: 'О проекте',
    pricingButton: 'Цены',
    titleLines: ['Форма мечты', 'начинается', 'с тарелки'],
    leadLines: ['Вы ставите цель, а мы собираем меню,', 'которое к ней ведёт — вкусно и легко'],
    cta: { label: 'Создать меню', href: '#quiz' },
    featuresLabel: 'Возможности Refectorio',
    features: [
      {
        title: 'Исследования',
        textLines: ['Нормы — из науки,', 'а не из соцсетей'],
        icon: 'school',
      },
      {
        title: 'ИИ-помощник',
        textLines: ['Рядом на каждом шаге —', 'от меню до результата'],
        icon: 'sparkles',
      },
      {
        title: 'Только ваше',
        textLines: ['Меню под ваш вкус,', 'ритм жизни и цель'],
        icon: 'pencil',
      },
      {
        title: 'Честно',
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
    title: 'Выберите свой темп',
    lead: 'Начните бесплатно — переходите на Premium, когда захочется большего.',
    plansLabel: 'Тарифы',
    close: 'Закрыть',
    plans: [
      {
        id: 'free',
        name: 'Бесплатно',
        price: '0 ₽',
        period: 'навсегда',
        tagline: 'Чтобы сделать первый шаг',
        features: [
          'Тест, игра с блюдами и расчёт норм',
          'Меню на неделю с рецептами — 1 раз',
          'Корзина в магазине в один клик',
          'Сканер штрихкодов — 3 в день',
          'ИИ-помощник — 5 вопросов в день',
          'График веса',
        ],
        action: 'Начать бесплатно',
      },
      {
        id: 'premium',
        name: 'Premium',
        price: '299 ₽',
        period: 'в месяц',
        note: 'или 1 990 ₽ в год — это 166 ₽ в месяц',
        tagline: 'Для тех, кто идёт к цели всерьёз',
        badge: 'Рекомендуем',
        features: [
          'Всё из бесплатного',
          'Новое меню каждую неделю',
          'Замена любого блюда',
          'Сравнение цен в 2–3 магазинах',
          'Ланч-боксы и готовка на неделю за 2 часа',
          'Дома и в офисе — одно меню',
          'Режим «без готовки» и кафе на карте',
          'Сканер и ИИ-помощник без лимитов',
          'Меню подстраивается под ваш вес',
          'Без предложений партнёров',
          'Семья: +149 ₽ за человека',
        ],
        action: 'Оформить подписку',
      },
      {
        id: 'business',
        name: 'Для компаний',
        price: '150 ₽',
        period: 'за сотрудника в месяц',
        tagline: 'Забота о команде без лишних хлопот',
        features: ['Premium для каждого сотрудника', 'Командные челленджи', 'Отчёт для HR'],
        action: 'Подключить компанию',
      },
    ],
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
    },
  },
} as const satisfies SiteContent;
