import {
  addDays,
  dayStatus,
  drinking,
  markKey,
  totals,
  type Plan,
  type Tracking,
} from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';
import { fill, formatWhole, pluralRu } from '../../../lib/format';
import { LETTER_IMAGES, type Letter, type Settings } from '../store/schema';
import { dayMonth } from '../week/dates';

/**
 * «Новости от Кики» (ТЗ фаза 4 §11): letters written locally by rules from the plan and the marks — never invented
 * promotions, stores or dates. The welcome pair on the first open, then at most one letter a day (on opening the app):
 * yesterday's recap, or a tip the plan itself calls for. Phase 7 lets Kiki rephrase them, never add facts.
 */

export const TIPS = ['fibre', 'breakfast', 'water'] as const;
export type Tip = (typeof TIPS)[number];

type State = {
  readonly plan: Plan;
  readonly tracking: Tracking;
  readonly letters: readonly Letter[];
  readonly settings: Settings;
  readonly today: string;
  readonly deemphasizeNumbers: boolean;
};

/** A letter image unlike the last one (1–7). */
function imageAfter(letters: readonly Letter[], random: () => number): number {
  const last = letters.at(-1)?.image;
  const pick = 1 + Math.floor(random() * (LETTER_IMAGES - 1));
  return last !== undefined && pick >= last ? pick + 1 : pick;
}

/** The tips this plan calls for: fibre and breakfast protein where the engine flagged days; water always. */
export function tipsFor(plan: Plan): Tip[] {
  const flags = plan.days.flatMap((d) => d.flags);
  const breakfasts = new Set(plan.structure.filter((m) => m.kind === 'breakfast').map((m) => m.id));
  return TIPS.filter(
    (tip) =>
      tip === 'water' ||
      (tip === 'fibre' && flags.some((f) => f.code === 'fibreLow')) ||
      (tip === 'breakfast' &&
        flags.some(
          (f) => f.code === 'mealProteinLow' && f.meal !== undefined && breakfasts.has(f.meal),
        )),
  );
}

/** Yesterday as the recap letter's facts (only if it was a day of the menu). */
function recapData(state: State): Letter['data'] | null {
  const date = addDays(state.today, -1);
  const day = state.plan.days.find((d) => d.date === date);
  if (!day) return null;
  const status = dayStatus(state.plan, date, state.tracking, state.today);
  // A day without any marks gets no «итоги» (no blame, ТЗ tone): a tip comes instead.
  if (status === 'none' || status === 'missed') return null;
  const t = state.tracking.days[date];
  const water = drinking(day, state.plan.targets, t);
  const meals = Object.entries(day.meals).filter(([, items]) => items.length > 0);
  const eatenMeals = meals.filter(([mealId, items]) =>
    items.some((item) => t?.eaten[markKey(mealId, item.itemId)] !== undefined),
  ).length;
  return {
    date,
    status,
    eaten: Math.round(totals(day, { eatenOnly: true, ...(t ? { tracking: t } : {}) }).energyKcal),
    target: Math.round(state.plan.targets.energyKcal),
    meals: eatenMeals,
    total: meals.length,
    drunk: Math.round(water.drunkGlasses),
    glasses: water.targetGlasses,
  };
}

/**
 * The letters to add on opening the app, and the day to remember. Pure: the time and the randomness come in.
 */
export function newLetters(
  state: State,
  now: Date,
  random: () => number,
): { letters: Letter[]; lastLetterDay: string | null } {
  const at = now.toISOString();
  const out: Letter[] = [];
  const add = (kind: Letter['kind'], data: Letter['data'] = {}) => {
    out.push({
      id: `${kind}-${String(now.getTime())}-${String(out.length)}`,
      kind,
      at,
      read: false,
      image: imageAfter([...state.letters, ...out], random),
      data,
    });
  };
  if (state.letters.length === 0) {
    add('welcome');
    add('localOnly');
    return { letters: out, lastLetterDay: state.today };
  }
  if (!state.settings.dailyDigest || state.settings.lastLetterDay === state.today)
    return { letters: [], lastLetterDay: state.settings.lastLetterDay };
  const recap = recapData(state);
  if (recap) add('recap', recap);
  else {
    // The tip sent longest ago (never sent first), among those the plan calls for.
    const sent = (tip: Tip) =>
      state.letters.findLastIndex((l) => l.kind === 'tip' && l.data.tip === tip);
    // Grams of fibre or protein are numbers too: with `deemphasizeNumbers` only the water tip.
    const tips = tipsFor(state.plan).filter((t) => !state.deemphasizeNumbers || t === 'water');
    const tip = [...tips].sort((a, b) => sent(a) - sent(b))[0];
    if (tip) add('tip', { tip });
  }
  return { letters: out, lastLetterDay: state.today };
}

/** A receipt of a change the person made (already read: they know). */
export function changeLetter(
  letters: readonly Letter[],
  what: string,
  now: Date,
  random: () => number,
): Letter {
  return {
    id: `change-${String(now.getTime())}`,
    kind: 'change',
    at: now.toISOString(),
    read: true,
    image: imageAfter(letters, random),
    data: { what },
  };
}

const PARAGRAPH = String.fromCharCode(10).repeat(2);

export type LetterText = {
  readonly title: string;
  readonly preview: string;
  readonly body: string;
};

const glasses = (n: number) => `${String(n)}\u00a0${pluralRu(n, menu.glasses)}`;

/** The letter's words from its facts (texts: content/menu.ru.ts; numbers: the plan's). */
export function letterText(
  letter: Letter,
  plan: Plan,
  deemphasizeNumbers: boolean,
  today: string,
): LetterText {
  const l = menu.news.letters;
  const d = letter.data;
  switch (letter.kind) {
    case 'welcome':
      return l.welcome;
    case 'localOnly':
      return l.localOnly;
    case 'recap': {
      const key = (['done', 'partial', 'missed'] as const).find((k) => k === d.status) ?? 'partial';
      const status = l.recap.status[key];
      const facts = {
        date: dayMonth(String(d.date)),
        status,
        eaten: formatWhole(Number(d.eaten)),
        target: formatWhole(Number(d.target)),
        meals: String(d.meals),
        total: String(d.total),
        drunk: String(d.drunk),
        glasses: glasses(Number(d.glasses)),
      };
      return {
        title: l.recap.title,
        preview: fill(l.recap.preview, { short: fill(l.recap.short, facts) }),
        body: fill(deemphasizeNumbers ? l.recap.bodyCalm : l.recap.body, facts),
      };
    }
    case 'tip': {
      const t = plan.targets;
      if (d.tip === 'fibre')
        return { ...l.tipFibre, body: fill(l.tipFibre.body, { n: formatWhole(t.fibreG.target) }) };
      if (d.tip === 'breakfast')
        return {
          ...l.tipBreakfast,
          body: fill(l.tipBreakfast.body, { n: formatWhole(t.mealProteinMinG) }),
        };
      // Food water differs by day: today's menu (or the plan's last day) gives the glasses.
      const day = plan.days.find((x) => x.date === today) ?? plan.days.at(-1);
      if (!day) return { ...l.tipWater, body: l.tipWater.body.split(PARAGRAPH)[1] ?? '' };
      return {
        ...l.tipWater,
        body: fill(l.tipWater.body, { n: glasses(drinking(day, t).targetGlasses) }),
      };
    }
    case 'change':
    case 'season':
      return {
        title: l.change.title,
        preview: fill(l.change.preview, { what: String(d.what ?? '') }),
        body: fill(l.change.body, { what: String(d.what ?? '') }),
      };
  }
}
