import type { SiteContent } from './schema';

/**
 * All user-facing text of the site (see .claude/rules/content.md).
 * Mockup texts are kept; only typos and punctuation are fixed:
 * «то что» → «то, что»; «ИИ помощник» → «ИИ-помощник»; « поможет» → «Поможет»;
 * «настроивайте» → «настраивайте»; «Ясинский алексей» → «Ясинский Алексей»;
 * «Название Проекта» (placeholder) → «Refectorio».
 */
export const site = {
  meta: {
    lang: 'ru',
    title: 'Refectorio — питаться полезно и вкусно',
    description: 'Создавайте меню под свои цели: научный расчёт, ИИ-помощник и персонализация.',
  },
  brand: {
    name: 'Refectorio',
    logoIcon: 'apple',
  },
  hero: {
    aboutButton: 'О проекте',
    titleLines: ['Питаться', 'полезно и', 'вкусно сейчас'],
    leadLines: ['Создавайте меню, выбирайте то, что', 'любите, ставьте цели, в пару кликов'],
    cta: { label: 'Создать меню', href: '#quiz', toast: 'Скоро: интерактивный тест' },
    featuresLabel: 'Возможности Refectorio',
    features: [
      {
        title: 'Наука',
        textLines: ['Генерация основана на', 'реальных исследованиях'],
        icon: 'school',
      },
      {
        title: 'ИИ-помощник',
        textLines: ['Поможет исправить меню', 'под ваши задачи'],
        icon: 'sparkles',
      },
      {
        title: 'Персонализация',
        textLines: ['Редактируйте меню и', 'настраивайте для себя'],
        icon: 'pencil',
      },
      {
        title: 'Гарантия',
        textLines: ['Открытый исходный код и', 'сохранение ваших данных'],
        icon: 'shieldCheck',
      },
    ],
    carouselLabel: 'Возможности, листайте вбок',
    carouselDotLabel: 'Карточка',
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
      more: 'Ещё',
      moreLabel: 'Ещё о команде Modern Manifesto',
    },
    project: {
      label: 'Проект:',
      nameLines: ['Refectorio'],
      leadLines: ['Учащиеся школы', '#2107'],
      image: 'teamLogo',
      imageAlt: 'Логотип проекта (временный)',
      links: [
        { label: 'Исходный код', href: null, soonHint: 'Скоро' },
        { label: 'Документация', href: null, soonHint: 'Скоро' },
      ],
    },
  },
  teamDialog: {
    nameLines: ['Modern', 'Manifesto'],
    leadLines: ['Учащиеся школы', '#2107'],
    membersLabel: 'Участники команды',
    members: [
      ['Старостин Михаил', 'Малютин Артём', 'Устименко Милана'],
      ['Ясинский Алексей', 'Щербюк Анна'],
    ],
    close: 'Закрыть',
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
