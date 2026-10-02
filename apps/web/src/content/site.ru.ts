import type { SiteContent } from './schema';

/** All user-facing text of the site lives here (see .claude/rules/content.md). */
export const site = {
  meta: {
    lang: 'ru',
    title: 'Refectorio — питаться полезно и вкусно',
    description: 'Создавайте меню под свои цели: научный расчёт, ИИ-помощник и персонализация.',
  },
  brand: {
    name: 'Refectorio',
  },
  comingSoon: {
    heading: 'Refectorio — скоро',
    lead: 'Меню под ваши цели: научный расчёт, ИИ-помощник и персонализация.',
    team: 'Modern Manifesto · школа #2107',
  },
} as const satisfies SiteContent;
