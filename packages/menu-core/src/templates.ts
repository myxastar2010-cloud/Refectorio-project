/**
 * How a meal is put together (ТЗ фаза 3 §3.2, R17 + Russian habits): breakfast = main [+ bread] [+ fruit] [+ drink];
 * lunch = [soup] + main + side [+ salad] [+ drink]; dinner = main + side or salad [+ drink]; snack = fruit, dairy,
 * nuts or a small dish [+ drink]. The core slot is always filled; the planner switches optional slots on when the
 * meal's energy and the day's quotas call for them, weighed against habit costs. At most four items a meal (the
 * menu cards, фаза 4 §7).
 */
import type { Role } from '@refectorio/food-data';
import type { MealKind } from './types';

export type SlotKind =
  'core' | 'soup' | 'side' | 'salad' | 'bread' | 'fruit' | 'dairy' | 'drink' | 'extra';

export type SlotSpec = {
  readonly slot: SlotKind;
  readonly roles: readonly Role[];
  /** Order of the cards in the meal. */
  readonly display: number;
  /** Habit cost of having the slot (an unusual extra) and of leaving it out (tea at breakfast, soup at lunch). */
  readonly presence: number;
  readonly absence: number;
};

export const MAX_ITEMS_PER_MEAL = 4;

export const MEAL_SLOTS: Readonly<Record<MealKind, readonly SlotSpec[]>> = {
  breakfast: [
    { slot: 'core', roles: ['main', 'snack', 'dessert'], display: 0, presence: 0, absence: 0 },
    { slot: 'bread', roles: ['bread'], display: 1, presence: 0.15, absence: 0 },
    { slot: 'fruit', roles: ['fruit'], display: 2, presence: 0.1, absence: 0 },
    { slot: 'dairy', roles: ['dairy'], display: 3, presence: 0.3, absence: 0 },
    { slot: 'drink', roles: ['drink'], display: 4, presence: 0, absence: 0.6 },
  ],
  lunch: [
    { slot: 'soup', roles: ['soup'], display: 0, presence: 0, absence: 0.5 },
    { slot: 'core', roles: ['main'], display: 1, presence: 0, absence: 0 },
    { slot: 'side', roles: ['side'], display: 2, presence: 0, absence: 0 },
    { slot: 'salad', roles: ['salad'], display: 3, presence: 0.15, absence: 0 },
    { slot: 'bread', roles: ['bread'], display: 4, presence: 0.2, absence: 0 },
    { slot: 'drink', roles: ['drink'], display: 5, presence: 0.05, absence: 0.1 },
  ],
  dinner: [
    { slot: 'core', roles: ['main'], display: 0, presence: 0, absence: 0 },
    { slot: 'side', roles: ['side'], display: 1, presence: 0, absence: 0 },
    { slot: 'salad', roles: ['salad'], display: 2, presence: 0.05, absence: 0 },
    { slot: 'bread', roles: ['bread'], display: 3, presence: 0.4, absence: 0 },
    { slot: 'drink', roles: ['drink'], display: 4, presence: 0.15, absence: 0 },
  ],
  snack: [
    {
      slot: 'core',
      roles: ['fruit', 'dairy', 'snack', 'dessert'],
      display: 0,
      presence: 0,
      absence: 0,
    },
    { slot: 'extra', roles: ['fruit', 'snack'], display: 1, presence: 0.3, absence: 0 },
    { slot: 'drink', roles: ['drink'], display: 2, presence: 0.2, absence: 0 },
  ],
};

/**
 * A main without its own starch (cutlets, baked salmon) needs a side at lunch and dinner — or at least a salad;
 * a main with its starch (plov, pasta) takes no side.
 */
export const SIDE_HABIT = { missing: 1, saladInstead: 0.35, needless: 1 } as const;
/** Bread with soup at lunch, with eggs or curd at breakfast — the usual Russian table. */
export const BREAD_WITH = { soup: 0.05, sideless: 0.05 } as const;
/**
 * Meal coherence (habit costs): a breakfast dish as lunch or dinner, a lunch dish for breakfast, bread next to a
 * dish that has its own starch at lunch or dinner, the same starch (pasta, rice) at lunch and at dinner.
 */
export const COHERENCE = {
  courseMismatch: 0.6,
  doubleStarch: 0.8,
  sameStarchDay: 0.6,
  sidePairing: 0.6,
} as const;
/** Sides that belong with an Asian main: rice, noodles or vegetables (not buckwheat or pasta). */
export const ASIAN_CUISINES: ReadonlySet<string> = new Set([
  'chinese',
  'japanese',
  'korean',
  'southeastAsian',
  'indian',
]);
export const ASIAN_SIDE_BASES: ReadonlySet<string> = new Set(['rice', 'noodles', 'none']);

export const slotSpec = (kind: MealKind, slot: SlotKind): SlotSpec | undefined =>
  MEAL_SLOTS[kind].find((s) => s.slot === slot);
