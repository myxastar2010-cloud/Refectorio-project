/**
 * @refectorio/menu-core — the weekly menu engine (ТЗ этапа 4, фаза 3; ADR 0014): hard safety filter, weekly planner,
 * portion solver, validator, explanations, rules DSL, operations with diffs, tracking and day status, search.
 * Pure TypeScript: no UI, no network, no AI, no clock — `today` and `seed` are inputs; deterministic.
 */
export * from './types';
export * from './dates';
export { RULES, RULES_VERSION, RULE_IDS, rule, type RuleId, type RuleRecord } from './rules';
export {
  CATEGORIES,
  CATEGORY_IDS,
  createTermResolver,
  ingredientCategories,
  resolveTerms,
  unmatchedWords,
  withAncestors,
  type CategoryId,
  type TermMatch,
  type TermResolver,
  type TermVocabulary,
} from './taxonomy';
export { normalize, stem, tokenize, withinOneEdit, type Token } from './text';
export {
  buildFoodIndex,
  portionGrid,
  scaleNutrients,
  type FoodIndex,
  type FoodIndexInput,
  type GroupGrams,
  type MenuFood,
} from './foods';
export {
  buildMenuProfile,
  mergeDecisions,
  stableHash,
  type MenuProfile,
  type ProfileError,
  type SafetyContext,
} from './profile';
export { checkFood, HARD_REASONS, type HardReason, type Verdict } from './filter';
export { likeProbability } from './taste';
export {
  canRemoveMeal,
  checkStructure,
  DEFAULT_STRUCTURE,
  isMainMeal,
  mealHours,
  mealShares,
  structureFromKinds,
  type StructureError,
} from './structure';
export { MAX_ITEMS_PER_MEAL, MEAL_SLOTS, type SlotKind, type SlotSpec } from './templates';
export {
  solveDay,
  BASE_WEIGHTS,
  type DayProblem,
  type DaySolution,
  type Weights,
} from './portions';
export {
  daysScopeSchema,
  parseRules,
  RULE_CONFLICT_CODES,
  ruleSchema,
  targetSchema,
  type DaysScope,
  type Rule,
  type RuleConflict,
  type RuleConflictCode,
  type RuleKind,
  type RuleTarget,
} from './dsl';
export { dayTotals } from './assemble';
export { hardViolations, dayFlags, type HardViolation } from './validate';
export {
  DEFAULT_ITERATIONS_PER_DAY,
  generate,
  planRange,
  type GenerateRequest,
  type PlanError,
  type RangeRequest,
  type RangeResult,
} from './generate';
