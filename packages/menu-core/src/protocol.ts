/**
 * The menu worker's message protocol (ТЗ фаза 3 §9): the site's `menu.worker.ts` answers these requests with the
 * engine; the main thread wraps them in promises with a timeout and cancels by terminating the worker. Shared here so
 * the worker, the client and the tests agree on one set of types.
 */
import type { IsoDate } from './dates';
import type { Rule } from './dsl';
import type { Alternative, OpError, PlanDiff } from './operations';
import type { SearchHit } from './search';
import type { Tracking } from './tracking';
import type { DayTargets, Meal, Plan, SlotRef } from './types';
import type { ProfileError } from './profile';
import type { ItemView } from './view';
import type { PlanError } from './generate';

export type GenerateMessage = {
  readonly type: 'generate';
  readonly answers: unknown;
  readonly today: IsoDate;
  readonly seed: number;
  readonly structure?: readonly Meal[];
  readonly rules?: readonly Rule[];
};

export type ApplyMessage = {
  readonly type: 'apply';
  readonly answers: unknown;
  readonly plan: Plan;
  readonly today: IsoDate;
  readonly tracking?: Tracking;
  readonly seed?: number;
} & (
  | { readonly op: 'regenerate' }
  | { readonly op: 'setStructure'; readonly structure: readonly Meal[] }
  | { readonly op: 'applyRules'; readonly rules: readonly Rule[] }
  | { readonly op: 'extendHorizon'; readonly toDate: IsoDate }
  | { readonly op: 'replaceItem'; readonly slot: SlotRef; readonly itemId: string }
);

export type AlternativesMessage = {
  readonly type: 'alternatives';
  readonly answers: unknown;
  readonly plan: Plan;
  readonly slot: SlotRef;
  readonly k: number;
  readonly tracking?: Tracking;
};

export type SearchMessage = {
  readonly type: 'search';
  readonly plan: Plan;
  readonly query: string;
};

export type MenuRequest = { readonly id: number } & (
  | { readonly type: 'init' }
  /** What the page shows about every item (names, allergens, portions, nutrients, ingredients). */
  | { readonly type: 'catalog' }
  /** The person's structure limits (the fewest main meals), so the page offers only allowed edits. */
  | { readonly type: 'limits'; readonly answers: unknown }
  /** The day's targets for (changed) answers — the goal sheet's preview, before anything is re-planned. */
  | { readonly type: 'targets'; readonly answers: unknown }
  | GenerateMessage
  | ApplyMessage
  | AlternativesMessage
  | SearchMessage
);

export type MenuStage = 'loading' | 'profile' | 'planning' | 'polishing' | 'done';

export type MenuError =
  | { readonly code: 'profile'; readonly error: ProfileError }
  | { readonly code: 'plan'; readonly error: PlanError | OpError }
  | { readonly code: 'internal'; readonly detail: string };

export type MenuResponse =
  | {
      readonly id: number;
      readonly type: 'progress';
      readonly stage: MenuStage;
      readonly share: number;
    }
  | { readonly id: number; readonly type: 'ready' }
  | {
      readonly id: number;
      readonly type: 'plan';
      readonly plan: Plan;
      readonly diff: PlanDiff | null;
      readonly ms: number;
    }
  | {
      readonly id: number;
      readonly type: 'alternatives';
      readonly alternatives: readonly Alternative[];
    }
  | { readonly id: number; readonly type: 'search'; readonly hits: readonly SearchHit[] }
  | { readonly id: number; readonly type: 'catalog'; readonly items: readonly ItemView[] }
  | { readonly id: number; readonly type: 'limits'; readonly minMainMeals: number }
  | { readonly id: number; readonly type: 'targets'; readonly targets: DayTargets }
  | { readonly id: number; readonly type: 'error'; readonly error: MenuError };
