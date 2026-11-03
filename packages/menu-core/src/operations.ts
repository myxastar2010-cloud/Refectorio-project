/**
 * Operations on a plan (ТЗ фаза 3 §5). Each is pure and returns a new plan (revision + 1) with a diff; past days are
 * immutable history and eaten items stay where they are (§8). Used by the menu interface and by Kiki's tools.
 */
import { NUTRIENT_KEYS, type NutrientVector } from '@refectorio/food-data';
import { toDayPlan, planNotes } from './assemble';
import { buildContext } from './context';
import { addDays, compareDates, dateRange, endOfNextWeek, isIsoDate, type IsoDate } from './dates';
import { parseRules, type Rule, type RuleConflict } from './dsl';
import type { FoodIndex } from './foods';
import { planRange, type PlanError } from './generate';
import {
  candidateOk,
  capsHold,
  dayStateFrom,
  refreshDay,
  sideAllowed,
  stateFromHistory,
  totalCost,
  type PlannerState,
} from './planner';
import { reasonsFor } from './explain';
import type { MenuProfile } from './profile';
import { checkStructure, type StructureError } from './structure';
import { markKey, type Tracking } from './tracking';
import {
  err,
  ok,
  type DayPlan,
  type Meal,
  type Plan,
  type PlannedItem,
  type Portion,
  type ReasonCode,
  type Result,
  type SlotRef,
} from './types';
import { hardViolations } from './validate';

export type Engine = { readonly profile: MenuProfile; readonly foods: FoodIndex };

export type OpOptions = {
  readonly today: IsoDate;
  readonly seed?: number;
  readonly tracking?: Tracking;
  readonly iterationsPerDay?: number;
};

export type OpError =
  | PlanError
  | { readonly code: 'noSuchSlot' }
  | { readonly code: 'notAllowed'; readonly reasons: readonly string[] }
  | { readonly code: 'pastDay' }
  | { readonly code: 'eaten' }
  | { readonly code: 'invalidRules'; readonly detail: string }
  | { readonly code: 'structureRejected'; readonly error: StructureError };

export type MealDiff = {
  readonly mealId: string;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly portionChanged: readonly {
    readonly itemId: string;
    readonly before: number;
    readonly after: number;
  }[];
};

export type DayDiff = {
  readonly date: IsoDate;
  readonly meals: readonly MealDiff[];
  readonly totalsBefore: NutrientVector | null;
  readonly totalsAfter: NutrientVector | null;
};

export type PlanDiff = {
  readonly days: readonly DayDiff[];
  readonly structureChanged: boolean;
  readonly rulesChanged: boolean;
};

export type OpResult = Result<{ readonly plan: Plan; readonly diff: PlanDiff }, OpError>;

/** What changed between two plans, per day and meal (only changed days are listed). */
export function diff(a: Plan, b: Plan): PlanDiff {
  const before = new Map(a.days.map((d) => [d.date, d]));
  const after = new Map(b.days.map((d) => [d.date, d]));
  const dates = [...new Set([...before.keys(), ...after.keys()])].sort();
  const days: DayDiff[] = [];
  for (const date of dates) {
    const x = before.get(date);
    const y = after.get(date);
    const mealIds = [...new Set([...Object.keys(x?.meals ?? {}), ...Object.keys(y?.meals ?? {})])];
    const meals: MealDiff[] = [];
    for (const mealId of mealIds) {
      const xs = x?.meals[mealId] ?? [];
      const ys = y?.meals[mealId] ?? [];
      const xIds = new Map(xs.map((i) => [i.itemId, i.portion.factor]));
      const yIds = new Map(ys.map((i) => [i.itemId, i.portion.factor]));
      const added = [...yIds.keys()].filter((id) => !xIds.has(id));
      const removed = [...xIds.keys()].filter((id) => !yIds.has(id));
      const portionChanged = [...yIds]
        .filter(([id, f]) => xIds.has(id) && xIds.get(id) !== f)
        .map(([id, f]) => ({ itemId: id, before: xIds.get(id) ?? 1, after: f }));
      if (added.length || removed.length || portionChanged.length)
        meals.push({ mealId, added, removed, portionChanged });
    }
    if (meals.length > 0)
      days.push({ date, meals, totalsBefore: x?.totals ?? null, totalsAfter: y?.totals ?? null });
  }
  return {
    days,
    structureChanged: JSON.stringify(a.structure) !== JSON.stringify(b.structure),
    rulesChanged: JSON.stringify(a.rules) !== JSON.stringify(b.rules),
  };
}

/** Items of a day marked eaten: they stay when the day is re-planned. */
function eatenItems(
  day: DayPlan | undefined,
  tracking: Tracking | undefined,
): Record<string, PlannedItem[]> | null {
  const marks = day ? tracking?.days[day.date]?.eaten : undefined;
  if (!day || !marks) return null;
  const kept: Record<string, PlannedItem[]> = {};
  let any = false;
  for (const [mealId, items] of Object.entries(day.meals)) {
    const list = items.filter((i) => marks[markKey(mealId, i.itemId)] !== undefined);
    kept[mealId] = list;
    if (list.length > 0) any = true;
  }
  return any ? kept : null;
}

const nextSeed = (plan: Plan, seed?: number) =>
  seed ?? (plan.seed + plan.revision * 0x9e3779b1) >>> 0;

type Replan = {
  readonly profile: MenuProfile;
  readonly structure: readonly Meal[];
  readonly rules: readonly Rule[];
};

/** Re-plans today's uneaten slots and the future; past days stay (ТЗ фаза 3 §8). */
function replanFrom(engine: Engine, plan: Plan, next: Replan, options: OpOptions): OpResult {
  if (!isIsoDate(options.today)) return err({ code: 'invalidDate' });
  const today = options.today;
  const horizonEnd =
    compareDates(plan.horizonEnd, today) >= 0 ? plan.horizonEnd : endOfNextWeek(today);
  const history = plan.days.filter((d) => compareDates(d.date, today) < 0);
  const kept = eatenItems(
    plan.days.find((d) => d.date === today),
    options.tracking,
  );
  const result = planRange({
    profile: next.profile,
    foods: engine.foods,
    structure: next.structure,
    rules: next.rules,
    dates: dateRange(today, horizonEnd),
    seed: nextSeed(plan, options.seed),
    history,
    ...(kept ? { keep: new Map([[today, kept]]) } : {}),
    ...(options.iterationsPerDay !== undefined
      ? { iterationsPerDay: options.iterationsPerDay }
      : {}),
  });
  if (!result.ok) return result;
  const updated: Plan = {
    ...plan,
    revision: plan.revision + 1,
    seed: nextSeed(plan, options.seed),
    profileHash: next.profile.hash,
    targets: next.profile.targets,
    structure: next.structure,
    rules: next.rules,
    days: [...history, ...result.value.days],
    horizonEnd,
    notes: result.value.notes,
  };
  return ok({ plan: updated, diff: diff(plan, updated) });
}

export function regenerate(engine: Engine, plan: Plan, options: OpOptions): OpResult {
  return replanFrom(
    engine,
    plan,
    { profile: engine.profile, structure: plan.structure, rules: plan.rules },
    options,
  );
}

/** A goal or answers changed: the same plan re-planned to the new targets from today. */
export function changeTargets(engine: Engine, plan: Plan, options: OpOptions): OpResult {
  return regenerate(engine, plan, options);
}

export function setStructure(
  engine: Engine,
  plan: Plan,
  structure: readonly Meal[],
  options: OpOptions,
): OpResult {
  const checked = checkStructure(structure, engine.profile.safety.minMainMeals);
  if (!checked.ok) return err({ code: 'structureRejected', error: checked.error });
  return replanFrom(
    engine,
    plan,
    { profile: engine.profile, structure, rules: plan.rules },
    options,
  );
}

/** Replaces the plan's rules (validated by the shared schema); conflicts come back typed for Kiki to explain. */
export function applyRules(
  engine: Engine,
  plan: Plan,
  rules: unknown,
  options: OpOptions,
): OpResult {
  const parsed = parseRules(rules);
  if (!parsed.success)
    return err({ code: 'invalidRules', detail: parsed.error.issues[0]?.message ?? '' });
  return replanFrom(
    engine,
    plan,
    { profile: engine.profile, structure: plan.structure, rules: parsed.data },
    options,
  );
}

/** Checks rules without changing the plan: the conflicts Kiki must explain before proposing them. */
export function ruleConflicts(
  engine: Engine,
  plan: Plan,
  rules: readonly Rule[],
): readonly RuleConflict[] {
  return buildContext(engine.profile, engine.foods, plan.structure, rules).rules.conflicts;
}

/** Plans days after the horizon (the person scrolled forward); repeat windows continue across weeks. */
export function extendHorizon(
  engine: Engine,
  plan: Plan,
  toDate: IsoDate,
  options: Omit<OpOptions, 'today'> = {},
): OpResult {
  if (!isIsoDate(toDate)) return err({ code: 'invalidDate' });
  if (compareDates(toDate, plan.horizonEnd) <= 0) return ok({ plan, diff: diff(plan, plan) });
  const result = planRange({
    profile: engine.profile,
    foods: engine.foods,
    structure: plan.structure,
    rules: plan.rules,
    dates: dateRange(addDays(plan.horizonEnd, 1), toDate),
    seed: nextSeed(plan, options.seed),
    history: plan.days,
    ...(options.iterationsPerDay !== undefined
      ? { iterationsPerDay: options.iterationsPerDay }
      : {}),
  });
  if (!result.ok) return result;
  const updated: Plan = {
    ...plan,
    revision: plan.revision + 1,
    days: [...plan.days, ...result.value.days],
    horizonEnd: toDate,
    notes: result.value.notes,
  };
  return ok({ plan: updated, diff: diff(plan, updated) });
}

export type Alternative = {
  readonly itemId: string;
  readonly portion: Portion;
  readonly reasons: readonly ReasonCode[];
  /** How much worse (> 0) or better (< 0) the whole plan's cost gets. */
  readonly deltaCost: number;
  readonly dayTotalsAfter: NutrientVector;
};

type SlotSetup = {
  readonly ctx: ReturnType<typeof buildContext>;
  readonly state: PlannerState;
  readonly dayIndex: number;
  readonly mealIndex: number;
  readonly slotIndex: number;
};

/** The slot's day as an editable planner day (eaten items frozen) among the rest of the plan as history. */
function setupSlot(
  engine: Engine,
  plan: Plan,
  slot: SlotRef,
  tracking?: Tracking,
): Result<SlotSetup, OpError> {
  const ctx = buildContext(engine.profile, engine.foods, plan.structure, plan.rules);
  const dayPlan = plan.days.find((d) => d.date === slot.date);
  const mealIndex = plan.structure.findIndex((m) => m.id === slot.meal);
  const item = dayPlan?.meals[slot.meal]?.[slot.index];
  if (!dayPlan || mealIndex < 0 || !item) return err({ code: 'noSuchSlot' });
  const marks = tracking?.days[slot.date]?.eaten ?? {};
  if (marks[markKey(slot.meal, item.itemId)] !== undefined) return err({ code: 'eaten' });
  const day = dayStateFrom(ctx, dayPlan, {
    history: false,
    frozen: (mealId, itemId) => marks[markKey(mealId, itemId)] !== undefined,
  });
  const others = stateFromHistory(
    ctx,
    plan.days.filter((d) => d.date !== slot.date),
  );
  const days = [...others, day].sort((a, b) => compareDates(a.date, b.date));
  const state = { days };
  const dayIndex = days.indexOf(day);
  const slotIndex = (day.meals[mealIndex] ?? []).findIndex(
    (s) => ctx.foods[s.food]?.id === item.itemId,
  );
  if (slotIndex < 0) return err({ code: 'noSuchSlot' });
  refreshDay(ctx, state, day, true);
  return ok({ ctx, state, dayIndex, mealIndex, slotIndex });
}

/** Ranked replacements for one slot with re-solved portions («Заменить с ИИ», Kiki's suggest_alternatives). */
export function alternatives(
  engine: Engine,
  plan: Plan,
  slot: SlotRef,
  k = 5,
  tracking?: Tracking,
): Result<readonly Alternative[], OpError> {
  const setup = setupSlot(engine, plan, slot, tracking);
  if (!setup.ok) return setup;
  const { ctx, state, dayIndex, mealIndex, slotIndex } = setup.value;
  const day = state.days[dayIndex];
  const target = day?.meals[mealIndex]?.[slotIndex];
  const meal = ctx.structure[mealIndex];
  if (!day || !target || !meal) return err({ code: 'noSuchSlot' });
  const base = totalCost(ctx, state);
  const original = { food: target.food, fi: target.fi };
  const pool = ctx.pools[meal.kind][target.kind] ?? [];
  const scored: { food: number; delta: number; alternative: Alternative }[] = [];
  for (const food of pool) {
    if (food === original.food || !candidateOk(ctx, state, day, mealIndex, food, target)) continue;
    if (target.kind === 'side' && !sideAllowed(ctx, day.meals[mealIndex] ?? [])) continue;
    target.food = food;
    target.fi = (ctx.grids[food] ?? [1]).indexOf(1);
    refreshDay(ctx, state, day, true);
    if (!capsHold(ctx, state, day)) continue;
    const delta = totalCost(ctx, state) - base;
    const dayPlan = toDayPlan(ctx, day, []);
    const planned = dayPlan.meals[meal.id]?.find((i) => i.itemId === ctx.foods[food]?.id);
    if (planned) {
      scored.push({
        food,
        delta,
        alternative: {
          itemId: planned.itemId,
          portion: planned.portion,
          reasons: reasonsFor(ctx, day, mealIndex, target),
          deltaCost: delta,
          dayTotalsAfter: dayPlan.totals,
        },
      });
    }
  }
  target.food = original.food;
  target.fi = original.fi;
  scored.sort((a, b) => a.delta - b.delta || a.food - b.food);
  return ok(scored.slice(0, k).map((s) => s.alternative));
}

/** Puts `itemId` into the slot (re-solving the day's portions) if the safety filter and rules allow it there. */
export function replaceItem(
  engine: Engine,
  plan: Plan,
  slot: SlotRef,
  itemId: string,
  options: Pick<OpOptions, 'tracking' | 'today'>,
): OpResult {
  if (compareDates(slot.date, options.today) < 0) return err({ code: 'pastDay' });
  const setup = setupSlot(engine, plan, slot, options.tracking);
  if (!setup.ok) return setup;
  const { ctx, state, dayIndex, mealIndex, slotIndex } = setup.value;
  const day = state.days[dayIndex];
  const target = day?.meals[mealIndex]?.[slotIndex];
  const food = ctx.indexOf.get(itemId);
  if (!day || !target || food === undefined) return err({ code: 'noSuchSlot' });
  const verdict = ctx.verdicts[food];
  if (!verdict?.ok)
    return err({ code: 'notAllowed', reasons: verdict ? verdict.reasons : ['unknownItem'] });
  const meal = ctx.structure[mealIndex];
  const roleFits = meal ? (ctx.pools[meal.kind][target.kind] ?? []).includes(food) : false;
  if (!roleFits || !candidateOk(ctx, state, day, mealIndex, food, target))
    return err({ code: 'notAllowed', reasons: ['slot'] });
  target.food = food;
  target.fi = (ctx.grids[food] ?? [1]).indexOf(1);
  refreshDay(ctx, state, day, true);
  const previous = plan.days.filter((d) => compareDates(d.date, slot.date) < 0);
  const replaced = toDayPlan(ctx, day, previous);
  const marks = options.tracking?.days[slot.date]?.eaten ?? {};
  const violations = hardViolations(
    ctx,
    [replaced],
    plan.days,
    (_, mealId, itemId) => marks[markKey(mealId, itemId)] !== undefined,
  );
  if (violations.length > 0) return err({ code: 'unsafe', violations });
  const updated: Plan = {
    ...plan,
    revision: plan.revision + 1,
    days: plan.days.map((d) => (d.date === slot.date ? replaced : d)),
    notes: planNotes(ctx, state.days),
  };
  return ok({ plan: updated, diff: diff(plan, updated) });
}

/** Sum of two nutrient vectors (unknown in either → unknown). */
export function addVectors(a: NutrientVector, b: NutrientVector): NutrientVector {
  const out = {} as Record<keyof NutrientVector, number | null>;
  for (const key of NUTRIENT_KEYS) {
    const x = a[key];
    const y = b[key];
    out[key] = x === null || y === null ? null : x + y;
  }
  return out;
}
