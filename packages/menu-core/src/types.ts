/**
 * The plan model (ТЗ этапа 4, фаза 3 §1). Everything here is plain JSON: plans are stored in IndexedDB, exported to a
 * file and sent to Kiki's tools as they are.
 */
import type { NutrientKey, NutrientVector, Role } from '@refectorio/food-data';
import type { AllergenCode } from '@refectorio/nutrition-core';
import type { IsoDate } from './dates';
import type { Rule } from './dsl';
import type { SlotKind } from './templates';

export type { IsoDate };

export const MEAL_KINDS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealKind = (typeof MEAL_KINDS)[number];

/** `breakfast`, `lunch`, `dinner`, `snack-1`, `snack-2`… — stable while the meal exists. */
export type MealId = string;

export type Meal = {
  readonly id: MealId;
  readonly kind: MealKind;
  /** «Завтрак», «Перекус 1». */
  readonly titleRu: string;
  /** Position in the day, 0-based (the UI may reorder meals). */
  readonly order: number;
};

/**
 * A portion as the multiple of the item's standard portion (`factor`; nutrients scale with it) plus what to show:
 * whole pieces (eggs, bread slices, fruit) or a volume (drinks).
 */
export type Portion = {
  readonly kind: 'factor' | 'pieces' | 'volume';
  readonly factor: number;
  readonly pieces?: number;
  readonly ml?: number;
};

/** Why the engine chose an item (texts: apps/web content `menu.ru.ts`, no numbers in them). */
export const REASON_CODES = [
  'tasteMatch',
  'proteinRich',
  'fibreRich',
  'vegetables',
  'fish',
  'legumes',
  'wholeGrain',
  'variety',
  'quick',
  'lunchBox',
  'weekendCooking',
  'lightDinner',
  'caffeineFreeEvening',
  'proteinForward',
  'lowSalt',
  'steadyEnergy',
  'ruleByUser',
  'ruleByKiki',
  'fixedPortion',
  'servedWithout',
  'balance',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export type PlannedItem = {
  readonly itemId: string;
  readonly role: Role;
  /** Its place in the meal (core dish, soup, side, drink…): keeps edits and re-plans exact. */
  readonly slot: SlotKind;
  readonly portion: Portion;
  readonly grams: number;
  readonly nutrients: NutrientVector;
  readonly reasons: readonly ReasonCode[];
  /** Placed by this rule (`includeItem`); the planner never moves it. */
  readonly pinnedBy?: string;
  /** Serving add-ons to leave out (nuts on porridge for a nut allergy). */
  readonly servedWithout?: readonly AllergenCode[];
};

/** Honest notes on a day the engine could not make ideal (texts in `menu.ru.ts`). */
export const DAY_FLAG_CODES = [
  'energyLow',
  'energyHigh',
  'proteinLow',
  'mealProteinLow',
  'fibreLow',
  'vegFruitLow',
  'sodiumHigh',
  'freeSugarsHigh',
  'satFatHigh',
  'fatHigh',
  'carbsLow',
  'carbsHigh',
  'mealShareOff',
  'repeatRelaxed',
  'energyToleranceRelaxed',
  'cookTimeRelaxed',
  'fewCandidates',
] as const;
export type DayFlagCode = (typeof DAY_FLAG_CODES)[number];

export type DayFlag = {
  readonly code: DayFlagCode;
  readonly meal?: MealId;
  readonly nutrient?: NutrientKey;
};

export type DayPlan = {
  readonly date: IsoDate;
  readonly meals: Readonly<Record<MealId, readonly PlannedItem[]>>;
  readonly totals: NutrientVector;
  readonly flags: readonly DayFlag[];
};

/** Notes about the whole plan (weekly quotas, relaxed rules, profile adjustments). */
export const PLAN_NOTE_CODES = [
  'fishWeekLow',
  'redMeatWeekHigh',
  'freeSugarsWeekHigh',
  'satFatWeekHigh',
  'sodiumWeekHigh',
  'macroProfileAdjusted',
  'dislikesUnmatched',
  /** Allergy text the engine could not map exactly: the UI shows it before the menu, Kiki asks. */
  'allergyUnmatched',
  'veganB12',
  'fewBreakfasts',
] as const;
export type PlanNoteCode = (typeof PLAN_NOTE_CODES)[number];
export type PlanNote = {
  readonly code: PlanNoteCode;
  readonly week?: IsoDate;
  readonly text?: string;
};

export type Range = { readonly min: number; readonly target: number; readonly max: number };

/** One day's targets (nutrition-core + research/R17); the planner and the widgets read them. */
export type DayTargets = {
  readonly energyKcal: number;
  readonly proteinG: Range;
  readonly fatG: Range;
  readonly carbsG: Range;
  /** `target` — nutrition-core (NASEM 14 g/1000 kcal, ≥ 25 g); `min` — R17 E2 (25 g); flags below E2 floor (20 g). */
  readonly fibreG: { readonly min: number; readonly target: number };
  readonly freeSugarsMaxG: number;
  readonly freeSugarsGoalG: number;
  readonly satFatMaxG: number;
  readonly sodiumMaxMg: number;
  readonly potassiumMinMg: number;
  readonly vegFruitMinG: number;
  /** Total water, food included (EFSA); the drinking target subtracts the day's food water. */
  readonly waterTotalMl: number;
  readonly glassMl: number;
  readonly caffeineMaxMg: number;
  readonly caffeineSingleMaxMg: number;
  /** Protein floor of a main meal (R17 E15), grams. */
  readonly mealProteinMinG: number;
  /** МР 2.3.1.0253-21 norms (absent — no norm for this person); upper limits where NASEM gives them. */
  readonly micros: Readonly<
    Partial<Record<NutrientKey, { readonly norm: number; readonly ul?: number }>>
  >;
};

export type Plan = {
  readonly schema: 1;
  readonly revision: number;
  readonly seed: number;
  readonly createdAt: IsoDate;
  /** Hash of the inputs that shaped the plan (answers, taste): a different profile means «regenerate». */
  readonly profileHash: string;
  readonly targets: DayTargets;
  readonly structure: readonly Meal[];
  readonly rules: readonly Rule[];
  readonly days: readonly DayPlan[];
  readonly horizonEnd: IsoDate;
  readonly notes: readonly PlanNote[];
};

/** A slot: one item of one meal of one day. */
export type SlotRef = { readonly date: IsoDate; readonly meal: MealId; readonly index: number };

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
