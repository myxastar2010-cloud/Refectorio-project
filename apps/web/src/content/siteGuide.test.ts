import { describe, expect, it } from 'vitest';
import guideSource from '../../../../packages/kiki-core/knowledge/site-guide.ru.md?raw';
import { kiki } from './kiki.ru';
import { menu } from './menu.ru';

// ТЗ 07 §9: Kiki's site guide names every control exactly as the interface does. A new or renamed button without its
// line in the guide fails here — Kiki would otherwise send people to a label that does not exist.
const guide = guideSource.replaceAll(String.fromCharCode(0xa0), ' ');

/** Visible labels of the menu page's controls (buttons, menu items, tabs) — not hints, toasts or aria-only names. */
const LABELS: Record<string, string> = {
  'nav.menu': menu.nav.menu,
  'nav.stats': menu.nav.stats,
  'nav.shops': menu.nav.shops,
  'nav.recipes': menu.nav.recipes,
  'nav.account': menu.nav.account,
  'goal.hint': menu.goal.hint,
  'top.search': menu.top.search,
  'top.bell': menu.top.bell,
  'meals.edit': menu.meals.edit,
  'meals.add': menu.meals.add,
  'dish.recipe': menu.dish.recipe,
  'dish.details': menu.dish.details,
  'dish.replace': menu.dish.replace,
  'dish.replaceAi': menu.dish.replaceAi,
  'dish.replaceSelf': menu.dish.replaceSelf,
  'more.goal': menu.more.goal,
  'more.regenerate': menu.more.regenerate,
  'more.download': menu.more.download,
  'more.restore': menu.more.restore,
  'export.json': menu.export.formats.json,
  'account.avatar': menu.account.avatar,
  'account.notifications': menu.account.notifications,
  'account.support': menu.account.support,
  'account.privacy': menu.account.privacy,
  'account.download': menu.account.download,
  'account.wipe': menu.account.wipe,
  'account.login': menu.account.login,
  'news.digest': menu.news.digest,
  'details.overview': menu.details.tabs.overview,
  'details.nutrition': menu.details.tabs.nutrition,
  'details.ingredients': menu.details.tabs.ingredients,
  'details.micros': menu.details.tabs.micros,
  'details.allergens': menu.details.tabs.allergens,
  'kiki.clear': kiki.clear,
  'kiki.apply': kiki.preview.apply,
};

describe('Kiki’s site guide', () => {
  it.each(Object.entries(LABELS))('names «%s» exactly as the interface does', (_key, label) => {
    expect(guide).toContain(label);
  });
});
