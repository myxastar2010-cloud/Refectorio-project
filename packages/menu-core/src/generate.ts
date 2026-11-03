/**
 * `generate` and `planRange`: build the days of a range with the planner, around the history that stays as it is
 * (past days, eaten items). Every other operation (regenerate, extendHorizon, setStructure, applyRules,
 * changeTargets) is `planRange` over the days it may touch.
 */
import { createRandom } from '@refectorio/taste-core';
import { toDayPlan, planNotes } from './assemble';
import { buildContext, type PlanContext } from './context';
import { addDays, dateRange, endOfNextWeek, isIsoDate, type IsoDate } from './dates';
import type { Rule, RuleConflict } from './dsl';
import type { FoodIndex } from './foods';
import {
  constructDay,
  dayStateFrom,
  emptyDay,
  localSearch,
  polish,
  refreshDay,
  stateFromHistory,
  costBreakdown,
  type CostBreakdown,
  type DayState,
  type SearchStats,
} from './planner';
import type { MenuProfile } from './profile';
import { checkStructure, DEFAULT_STRUCTURE, type StructureError } from './structure';
import type { SlotKind } from './templates';
import {
  err,
  ok,
  type DayPlan,
  type Meal,
  type MealKind,
  type Plan,
  type PlannedItem,
  type Result,
} from './types';
import { hardViolations, type HardViolation, type IsFact } from './validate';

export const DEFAULT_ITERATIONS_PER_DAY = 300;
const HISTORY_DAYS = 14;

export type PlanError =
  | { readonly code: 'invalidDate' }
  | { readonly code: 'structure'; readonly error: StructureError }
  | { readonly code: 'noCandidates'; readonly meal: MealKind; readonly slot: SlotKind }
  | { readonly code: 'rulesConflict'; readonly conflicts: readonly RuleConflict[] }
  | { readonly code: 'unsafe'; readonly violations: readonly HardViolation[] };

export type RangeRequest = {
  readonly profile: MenuProfile;
  readonly foods: FoodIndex;
  readonly structure: readonly Meal[];
  readonly rules: readonly Rule[];
  readonly dates: readonly IsoDate[];
  readonly seed: number;
  /** Earlier days (immutable): repeat windows and weekly quotas look at them. */
  readonly history: readonly DayPlan[];
  /** Items of a planned date that stay (eaten today): meal id → items. */
  readonly keep?: ReadonlyMap<IsoDate, Readonly<Record<string, readonly PlannedItem[]>>>;
  readonly iterationsPerDay?: number;
};

export type RangeResult = {
  readonly days: readonly DayPlan[];
  readonly notes: Plan['notes'];
  readonly stats: SearchStats & { readonly breakdown: CostBreakdown };
  readonly context: PlanContext;
};

const BLOCKING = new Set([
  'RULE_CONFLICTS_SAFETY',
  'RULE_UNKNOWN_TARGET',
  'RULE_CONTRADICTS_RULE',
  'RULE_INFEASIBLE',
]);

export function planRange(req: RangeRequest): Result<RangeResult, PlanError> {
  if (req.dates.length === 0 || !req.dates.every(isIsoDate)) return err({ code: 'invalidDate' });
  const structure = checkStructure(req.structure, req.profile.safety.minMainMeals);
  if (!structure.ok) return err({ code: 'structure', error: structure.error });
  const ctx = buildContext(req.profile, req.foods, req.structure, req.rules);
  const blocking = ctx.rules.conflicts.filter((c) => BLOCKING.has(c.code));
  if (blocking.length > 0) return err({ code: 'rulesConflict', conflicts: blocking });
  for (const meal of req.structure) {
    if ((ctx.pools[meal.kind].core?.length ?? 0) === 0)
      return err({ code: 'noCandidates', meal: meal.kind, slot: 'core' });
  }

  const planned = new Set(req.dates);
  // Two weeks of history are enough for every window and weekly quota.
  const first = [...req.dates].sort()[0] ?? '';
  const horizonStart = addDays(first, -HISTORY_DAYS);
  const history = stateFromHistory(
    ctx,
    req.history.filter((d) => !planned.has(d.date) && d.date >= horizonStart),
  );
  const fresh = req.dates.map((date): DayState => {
    const day = emptyDay(ctx, date);
    const kept = req.keep?.get(date);
    if (kept)
      day.meals = dayStateFrom(
        ctx,
        { date, meals: kept },
        { history: false, frozen: () => true },
      ).meals;
    return day;
  });
  const days = [...history, ...fresh].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const state = { days };
  const rng = createRandom(req.seed);
  days.forEach((day, i) => {
    if (!day.history) constructDay(ctx, state, i, rng);
  });
  const iterations = (req.iterationsPerDay ?? DEFAULT_ITERATIONS_PER_DAY) * fresh.length;
  const stats = localSearch(ctx, state, createRandom((req.seed ^ 0x5bd1e995) >>> 0), iterations);
  polish(ctx, state);
  for (const day of fresh) refreshDay(ctx, state, day, true);

  const out: DayPlan[] = [];
  const previous: DayPlan[] = [...req.history];
  for (const day of fresh) {
    const plan = toDayPlan(ctx, day, previous);
    out.push(plan);
    previous.push(plan);
  }
  // Eaten items are facts: a new allergy or rule must not make re-planning fail on what was already eaten (C2).
  const isFact: IsFact = (date, mealId, itemId) =>
    (req.keep?.get(date)?.[mealId] ?? []).some((i) => i.itemId === itemId);
  const violations = hardViolations(ctx, out, req.history, isFact);
  if (violations.length > 0) return err({ code: 'unsafe', violations });
  return ok({
    days: out,
    notes: planNotes(ctx, days),
    stats: { ...stats, breakdown: costBreakdown(ctx, state) },
    context: ctx,
  });
}

export type GenerateRequest = {
  readonly profile: MenuProfile;
  readonly foods: FoodIndex;
  readonly today: IsoDate;
  readonly seed: number;
  readonly structure?: readonly Meal[];
  readonly rules?: readonly Rule[];
  readonly iterationsPerDay?: number;
};

/** A new plan from today to the end of next week (8–14 days, ТЗ фаза 3 §8). */
export function generate(
  req: GenerateRequest,
): Result<{ plan: Plan; stats: RangeResult['stats'] }, PlanError> {
  if (!isIsoDate(req.today)) return err({ code: 'invalidDate' });
  const structure = req.structure ?? DEFAULT_STRUCTURE;
  const rules = req.rules ?? [];
  const horizonEnd = endOfNextWeek(req.today);
  const result = planRange({
    profile: req.profile,
    foods: req.foods,
    structure,
    rules,
    dates: dateRange(req.today, horizonEnd),
    seed: req.seed,
    history: [],
    ...(req.iterationsPerDay !== undefined ? { iterationsPerDay: req.iterationsPerDay } : {}),
  });
  if (!result.ok) return result;
  return ok({
    plan: {
      schema: 1,
      revision: 1,
      seed: req.seed,
      createdAt: req.today,
      profileHash: req.profile.hash,
      targets: req.profile.targets,
      structure,
      rules,
      days: result.value.days,
      horizonEnd,
      notes: result.value.notes,
    },
    stats: result.value.stats,
  });
}
