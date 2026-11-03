/**
 * The rules DSL (ТЗ фаза 3 §4): constraints and preferences the person or Kiki adds to the menu. One zod schema for
 * menu-core, the interface and Kiki's tools. Rules live in the plan and apply again on every regenerate; a rule can
 * never let an item through the safety filter (allergens, diet, guardrails) — such a rule is a typed conflict.
 */
import { NUTRIENT_KEYS, type NutrientKey } from '@refectorio/food-data';
import { GOALS } from '@refectorio/nutrition-core';
import { z } from 'zod';
import { isIsoDate, weekdayIndex, type IsoDate } from './dates';
import { CATEGORY_IDS, type CategoryId } from './taxonomy';

const itemId = z.string().regex(/^d_[a-z0-9_]{2,40}$/);
const category = z.enum(CATEGORY_IDS);
const nutrient = z.enum(NUTRIENT_KEYS as [NutrientKey, ...NutrientKey[]]);
const mealKind = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const isoDate = z.string().refine(isIsoDate, 'YYYY-MM-DD');

/** Which days a rule covers: every day, weekdays, weekends, days of the week (0 = Monday) or dates. */
export const daysScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('weekdays') }),
  z.object({ kind: z.literal('weekends') }),
  z.object({ kind: z.literal('weekdaysOf'), days: z.array(z.int().min(0).max(6)).min(1).max(7) }),
  z.object({ kind: z.literal('dates'), dates: z.array(isoDate).min(1).max(60) }),
]);
export type DaysScope = z.infer<typeof daysScopeSchema>;

/** An item or a category of items/ingredients. */
export const targetSchema = z.union([
  z.object({ itemId }),
  z.object({ category }),
  z.object({ ingredientId: z.string().min(2).max(40) }),
]);
export type RuleTarget = z.infer<typeof targetSchema>;

const base = {
  id: z.string().min(1).max(40),
  createdBy: z.enum(['user', 'kiki']),
  /** A human description shown in the interface («Без кофе по будням»). */
  textRu: z.string().trim().min(2).max(160),
  active: z.boolean(),
  days: daysScopeSchema.optional(),
  /** Meal kinds the rule covers; absent — every meal. */
  meals: z.array(mealKind).min(1).max(4).optional(),
};

export const ruleSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('excludeIngredient'), target: targetSchema }),
  z.object({ ...base, kind: z.literal('excludeItem'), itemId }),
  z.object({ ...base, kind: z.literal('includeItem'), target: targetSchema }),
  z.object({
    ...base,
    kind: z.literal('minNutrient'),
    nutrient,
    per: z.enum(['meal', 'day']),
    value: z.number().positive().max(100_000),
  }),
  z.object({
    ...base,
    kind: z.literal('maxNutrient'),
    nutrient,
    per: z.enum(['meal', 'day']),
    value: z.number().nonnegative().max(100_000),
  }),
  z.object({
    ...base,
    kind: z.literal('frequency'),
    target: targetSchema,
    minPerWeek: z.int().min(0).max(21).optional(),
    maxPerWeek: z.int().min(0).max(21).optional(),
  }),
  z.object({ ...base, kind: z.literal('replaceCategory'), from: category, to: category }),
  z.object({ ...base, kind: z.literal('preferLess'), target: targetSchema }),
  z.object({ ...base, kind: z.literal('preferMore'), target: targetSchema }),
  z.object({ ...base, kind: z.literal('goal'), goal: z.enum(GOALS) }),
  z.object({
    ...base,
    kind: z.literal('mealStructure'),
    mealKinds: z.array(mealKind).min(1).max(6),
  }),
]);
export type Rule = z.infer<typeof ruleSchema>;
export type RuleKind = Rule['kind'];

export const RULE_CONFLICT_CODES = [
  /** The rule would put an item through the safety filter (allergen, diet, guardrail). */
  'RULE_CONFLICTS_SAFETY',
  /** The rule leaves a meal without candidates or asks for an impossible amount. */
  'RULE_INFEASIBLE',
  /** Unknown item, ingredient or category. */
  'RULE_UNKNOWN_TARGET',
  /** Contradicts another active rule (include and exclude the same thing). */
  'RULE_CONTRADICTS_RULE',
  /** The kind is handled elsewhere (goal → targets, mealStructure → structure). */
  'RULE_NOT_A_FILTER',
] as const;
export type RuleConflictCode = (typeof RULE_CONFLICT_CODES)[number];
export type RuleConflict = {
  readonly ruleId: string;
  readonly code: RuleConflictCode;
  /** Machine-readable detail (an item id, an allergen code, a meal kind) for Kiki's explanation. */
  readonly detail?: string;
};

export function inDays(scope: DaysScope | undefined, date: IsoDate): boolean {
  if (!scope) return true;
  switch (scope.kind) {
    case 'all':
      return true;
    case 'weekdays':
      return weekdayIndex(date) < 5;
    case 'weekends':
      return weekdayIndex(date) >= 5;
    case 'weekdaysOf':
      return scope.days.includes(weekdayIndex(date));
    case 'dates':
      return scope.dates.includes(date);
  }
}

export const inMeals = (meals: readonly string[] | undefined, kind: string): boolean =>
  !meals || meals.includes(kind);

/** What a target refers to, for matching against an item. */
export type TargetMatcher = (food: {
  readonly id: string;
  readonly categories: ReadonlySet<CategoryId>;
  readonly ingredientIds: ReadonlySet<string>;
}) => boolean;

export function matcher(target: RuleTarget): TargetMatcher {
  if ('itemId' in target) return (f) => f.id === target.itemId;
  if ('category' in target) return (f) => f.categories.has(target.category);
  return (f) => f.ingredientIds.has(target.ingredientId);
}

export const parseRules = (value: unknown) => z.array(ruleSchema).max(100).safeParse(value);
