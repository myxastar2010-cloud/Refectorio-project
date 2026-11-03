/**
 * The weekly planner (ТЗ фаза 3 §3.2): a seeded greedy construction day by day with look-ahead on the weekly
 * quotas, then a local search (simulated annealing with a fixed number of moves: replace an item, switch an optional
 * slot, swap a meal between days). The objective is one cost: the day's nutrition after the portion solver + taste,
 * habits and context per slot + weekly food-group quotas + variety. Hard rules never enter the cost: candidates
 * come from the hard filter, DSL exclusions, the caffeine cut-off and the pregnancy fish caps are checked on every
 * move. Deterministic for (inputs, seed): no clock, a seeded generator, ties broken by index, arithmetic only.
 */
import type { Random } from '@refectorio/taste-core';
import type { IsoDate } from './dates';
import { allowedAt, isWeekday, limitsFor, weekKey, SLOT_TASTE, type PlanContext } from './context';
import { solveDay, type DayItem, type DaySolution } from './portions';
import { rule } from './rules';
import {
  ASIAN_CUISINES,
  ASIAN_SIDE_BASES,
  BREAD_WITH,
  COHERENCE,
  MAX_ITEMS_PER_MEAL,
  MEAL_SLOTS,
  SIDE_HABIT,
  type SlotKind,
  type SlotSpec,
} from './templates';
import type { DayPlan, MealId } from './types';

export type Slot = {
  kind: SlotKind;
  food: number;
  /** Index into the food's factor grid. */
  fi: number;
  /** Kept as it is: an eaten item, a past day. */
  frozen: boolean;
  pinnedBy: string | null;
};

export type DayAgg = {
  readonly energy: number;
  readonly freeSugars: number;
  readonly satFat: number;
  readonly fishG: number;
  readonly bestFishG: number;
  readonly goodFishG: number;
  readonly oilyFishServ: number;
  readonly tunaServ: number;
  readonly redMeatRawG: number;
  readonly processedServ: number;
  readonly legumesServ: number;
  readonly nutsServ: number;
  readonly wholeGrainServ: number;
  readonly dairyServ: number;
  readonly desserts: number;
  readonly fried: number;
  readonly herbalTea: number;
  readonly freq: readonly number[];
};

export type DayState = {
  readonly date: IsoDate;
  readonly week: IsoDate;
  readonly weekday: boolean;
  /** A day of history: counted for windows and quotas, never changed. */
  readonly history: boolean;
  meals: Slot[][];
  solution: DaySolution | null;
  agg: DayAgg | null;
  dayCost: number;
};

export type PlannerState = {
  readonly days: DayState[];
};

const sq = (x: number) => x * x;
const under = (value: number, min: number) => (min > 0 && value < min ? (min - value) / min : 0);

// ---------------------------------------------------------------- per-slot and per-meal costs (portion-free)

function specOf(ctx: PlanContext, mealIndex: number, slot: SlotKind): SlotSpec | undefined {
  const meal = ctx.structure[mealIndex];
  return meal ? MEAL_SLOTS[meal.kind].find((s) => s.slot === slot) : undefined;
}

export function slotCost(ctx: PlanContext, day: DayState, mealIndex: number, slot: Slot): number {
  const food = ctx.foods[slot.food];
  const meal = ctx.structure[mealIndex];
  if (!food || !meal) return 0;
  const C = ctx.costs;
  let c = C.taste * SLOT_TASTE[slot.kind] * (1 - (ctx.pLike[slot.food] ?? 0.5));
  // A breakfast or snack core is usually a dish (porridge, eggs) or fruit/dairy at a snack — a pastry less so.
  if (slot.kind === 'core' && meal.kind === 'breakfast' && food.role !== 'main') c += C.habit * 0.3;
  if (slot.kind === 'core' && food.role === 'main') {
    const breakfastDish = food.features.course === 'breakfast';
    if (breakfastDish !== (meal.kind === 'breakfast')) c += C.habit * COHERENCE.courseMismatch;
  }
  c += C.habit * (specOf(ctx, mealIndex, slot.kind)?.presence ?? 0);
  if (
    day.weekday &&
    meal.kind === 'lunch' &&
    food.role !== 'drink' &&
    !food.item.flags.has('boxable')
  )
    c += C.boxable;
  const cap = rule('P.weekdayCookMaxMin');
  if (day.weekday && food.item.cookMin > cap)
    c += C.cookTime * Math.min(1, (food.item.cookMin - cap) / cap);
  if (meal.kind === 'dinner' && slot.kind === 'core' && ctx.profile.extraGoals.has('sleep')) {
    const t = food.features.traits;
    c += C.sleepDinner * (Math.max(0, t.richness - 0.5) + Math.max(0, t.spiciness - 0.4));
  }
  if ((meal.kind === 'dinner' || (ctx.hours[mealIndex] ?? 0) >= 17) && food.caffeineMg >= 1)
    c += C.eveningCaffeine;
  if (
    food.role === 'drink' &&
    (food.item.perPortion.freeSugarsG ?? 0) >= rule('P.sweetDrinkFreeSugarsG')
  )
    c += C.habit * 0.3;
  c += C.processedItem * (food.groups.processedMeatG / rule('P.serving.processedMeatG'));
  for (const p of ctx.rules.prefer) {
    if (p.foods.has(slot.food) && p.appliesTo(day.date, meal.kind)) c += p.sign * C.prefer;
  }
  return c;
}

function mealHabitCost(ctx: PlanContext, mealIndex: number, slots: readonly Slot[]): number {
  const meal = ctx.structure[mealIndex];
  if (!meal) return 0;
  const present = new Set(slots.map((s) => s.kind));
  let c = 0;
  for (const spec of MEAL_SLOTS[meal.kind]) {
    if (
      !present.has(spec.slot) &&
      spec.absence > 0 &&
      (ctx.pools[meal.kind][spec.slot]?.length ?? 0) > 0
    )
      c += spec.absence;
  }
  const core = slots.find((s) => s.kind === 'core');
  const coreFood = core ? ctx.foods[core.food] : undefined;
  if ((meal.kind === 'lunch' || meal.kind === 'dinner') && coreFood) {
    if (coreFood.needsSide && !present.has('side'))
      c += present.has('salad') ? SIDE_HABIT.saladInstead : SIDE_HABIT.missing;
    const side = slots.find((s) => s.kind === 'side');
    const sideFood = side ? ctx.foods[side.food] : undefined;
    if (
      sideFood &&
      coreFood.cuisine &&
      ASIAN_CUISINES.has(coreFood.cuisine) &&
      !ASIAN_SIDE_BASES.has(sideFood.features.carbBase)
    )
      c += COHERENCE.sidePairing;
    if (!coreFood.needsSide && present.has('side')) c += SIDE_HABIT.needless;
  }
  if (
    (meal.kind === 'lunch' || meal.kind === 'dinner') &&
    present.has('bread') &&
    coreFood &&
    coreFood.features.carbBase !== 'none' &&
    !present.has('soup')
  )
    c += COHERENCE.doubleStarch;
  if (present.has('bread')) {
    const withSoup = meal.kind === 'lunch' && present.has('soup');
    const sideless = meal.kind === 'breakfast' && coreFood?.needsSide === true;
    if (withSoup) c += BREAD_WITH.soup - (specOf(ctx, mealIndex, 'bread')?.presence ?? 0);
    else if (sideless) c += BREAD_WITH.sideless - (specOf(ctx, mealIndex, 'bread')?.presence ?? 0);
  }
  return ctx.costs.habit * c;
}

// ---------------------------------------------------------------- day solution, aggregates, day cost

function dayProblemItems(ctx: PlanContext, day: DayState): { items: DayItem[]; refs: Slot[] } {
  const items: DayItem[] = [];
  const refs: Slot[] = [];
  day.meals.forEach((slots, m) => {
    for (const slot of slots) {
      const q = ctx.q[slot.food];
      const grid = ctx.grids[slot.food];
      if (!q || !grid) continue;
      const verdict = ctx.verdicts[slot.food];
      const fixedPortion = verdict?.ok === true && verdict.fixedPortion;
      items.push({
        q,
        grid,
        fixed: slot.frozen || fixedPortion,
        ...(slot.frozen ? { fixedAt: slot.fi } : {}),
        meal: m,
      });
      refs.push(slot);
    }
  });
  return { items, refs };
}

export function solveDayState(ctx: PlanContext, day: DayState, full: boolean): DaySolution {
  const { items, refs } = dayProblemItems(ctx, day);
  const solution = solveDay(
    {
      items,
      mealShare: ctx.shares,
      mainMeal: ctx.mainMeal,
      targets: ctx.profile.targets,
      weights: ctx.weights,
      limits: limitsFor(ctx, day.date),
    },
    refs.map((s) => s.fi),
    full,
  );
  refs.forEach((slot, i) => {
    slot.fi = solution.factorIndex[i] ?? slot.fi;
  });
  return solution;
}

export function aggregate(ctx: PlanContext, day: DayState): DayAgg {
  let fishG = 0;
  let bestFishG = 0;
  let goodFishG = 0;
  let oily = 0;
  let tuna = 0;
  let red = 0;
  let processed = 0;
  let legumes = 0;
  let nuts = 0;
  let wholeGrain = 0;
  let dairy = 0;
  let desserts = 0;
  let fried = 0;
  let herbal = 0;
  let energy = 0;
  let sugars = 0;
  let satFat = 0;
  const freq = ctx.rules.frequency.map(() => 0);
  const serving = rule('E9.fishServingG');
  for (const slots of day.meals) {
    for (const slot of slots) {
      const food = ctx.foods[slot.food];
      if (!food) continue;
      const f = ctx.grids[slot.food]?.[slot.fi] ?? 1;
      const g = food.groups;
      const n = food.item.perPortion;
      energy += f * (n.energyKcal ?? 0);
      sugars += f * (n.freeSugarsG ?? 0);
      satFat += f * (n.satFatG ?? 0);
      fishG += f * g.fishG;
      if (food.item.fishMercury === 'best') bestFishG += f * g.fishG;
      if (food.item.fishMercury === 'good') goodFishG += f * g.fishG;
      oily += (f * g.oilyFishG) / serving;
      tuna += (f * g.tunaG) / serving;
      red += f * g.redMeatRawG;
      processed += (f * g.processedMeatG) / rule('P.serving.processedMeatG');
      legumes += (f * g.legumesG) / rule('P.serving.legumesG');
      nuts += (f * g.nutsG) / rule('P.serving.nutsG');
      wholeGrain += (f * g.wholeGrainG) / rule('P.serving.wholeGrainG');
      dairy += f * g.dairyServings;
      if (food.role === 'dessert') desserts += 1;
      if (food.fried) fried += 1;
      if (food.categories.has('herbalTea')) herbal += 1;
      ctx.rules.frequency.forEach((r, i) => {
        if (r.foods.has(slot.food)) freq[i] = (freq[i] ?? 0) + 1;
      });
    }
  }
  return {
    energy,
    freeSugars: sugars,
    satFat,
    fishG,
    bestFishG,
    goodFishG,
    oilyFishServ: oily,
    tunaServ: tuna,
    redMeatRawG: red,
    processedServ: processed,
    legumesServ: legumes,
    nutsServ: nuts,
    wholeGrainServ: wholeGrain,
    dairyServ: dairy,
    desserts,
    fried,
    herbalTea: herbal,
    freq,
  };
}

function dayExtras(ctx: PlanContext, day: DayState, agg: DayAgg): number {
  const C = ctx.costs;
  let c = C.dessertDay * Math.max(0, agg.desserts - rule('P.dessertMaxPerDay'));
  if (ctx.dairyAllowed) c += C.dairyDay * sq(under(agg.dairyServ, rule('P.dairyMinServingsDay')));
  c += C.wholeGrainDay * sq(under(agg.wholeGrainServ, rule('P.wholeGrainMinServingsDay')));
  if (ctx.profile.safety.pregnant)
    c += C.pregnancyFish * Math.max(0, agg.herbalTea - rule('E21.herbalTeaMaxCupsDay'));
  // No same main protein at lunch and dinner (R17 §5).
  const proteins: string[] = [];
  day.meals.forEach((slots, m) => {
    const kind = ctx.structure[m]?.kind;
    if (kind !== 'lunch' && kind !== 'dinner') return;
    const core = slots.find((s) => s.kind === 'core');
    const p = core ? ctx.foods[core.food]?.mainProtein : undefined;
    if (p && p !== 'none' && p !== 'dairy') proteins.push(p);
  });
  if (proteins.length === 2 && proteins[0] === proteins[1]) c += C.sameProtein;
  const starches: string[] = [];
  day.meals.forEach((slots, m) => {
    const kind = ctx.structure[m]?.kind;
    if (kind !== 'lunch' && kind !== 'dinner') return;
    for (const s of slots) {
      const f = ctx.foods[s.food];
      if (f && (s.kind === 'core' || s.kind === 'side') && f.features.carbBase !== 'none')
        starches.push(f.features.carbBase);
    }
  });
  if (new Set(starches).size < starches.length) c += C.habit * COHERENCE.sameStarchDay;
  // includeItem: the rule's foods appear in a covered meal of this day.
  for (const inc of ctx.rules.includes) {
    const covered = ctx.structure
      .map((meal, m) => [meal, m] as const)
      .filter(([meal]) => inc.appliesTo(day.date, meal.kind));
    if (covered.length === 0) continue;
    const met = inc.meals
      ? covered.every(([, m]) => (day.meals[m] ?? []).some((s) => inc.foods.has(s.food)))
      : covered.some(([, m]) => (day.meals[m] ?? []).some((s) => inc.foods.has(s.food)));
    if (!met) c += C.includeRule;
  }
  return c;
}

export function refreshDay(ctx: PlanContext, day: DayState, full = false): void {
  const solution = solveDayState(ctx, day, full);
  const agg = aggregate(ctx, day);
  let c = solution.cost + dayExtras(ctx, day, agg);
  day.meals.forEach((slots, m) => {
    for (const slot of slots) c += slotCost(ctx, day, m, slot);
    c += mealHabitCost(ctx, m, slots);
  });
  day.solution = solution;
  day.agg = agg;
  day.dayCost = c;
}

// ---------------------------------------------------------------- weekly quotas

export function weekCosts(ctx: PlanContext, days: readonly DayState[]): number {
  const C = ctx.costs;
  const weeks = new Map<IsoDate, DayAgg[]>();
  for (const d of days) {
    if (!d.agg) continue;
    const list = weeks.get(d.week) ?? [];
    list.push(d.agg);
    weeks.set(d.week, list);
  }
  let c = 0;
  for (const aggs of weeks.values()) {
    const share = aggs.length / 7;
    const sum = (key: keyof Omit<DayAgg, 'freq'>) => aggs.reduce((s, a) => s + a[key], 0);
    if (ctx.fishAllowed)
      c += C.fishWeek * sq(under(sum('fishG'), rule('E10.fishTargetGWeek') * share));
    c +=
      C.redMeatWeek *
      sq(
        Math.max(
          0,
          sum('redMeatRawG') * rule('E22.redMeatCookedPerRawG') -
            rule('E22.redMeatMaxCookedGWeek') * share,
        ) /
          (rule('E22.redMeatMaxCookedGWeek') * share),
      );
    c +=
      C.processedWeek *
      Math.max(0, sum('processedServ') - rule('E23.processedMeatMaxServingsWeek') * share);
    c += C.legumesWeek * sq(under(sum('legumesServ'), rule('P.legumesMinServingsWeek') * share));
    if (ctx.nutsAllowed)
      c += C.nutsWeek * sq(under(sum('nutsServ'), rule('P.nutsMinServingsWeek') * share));
    c += C.friedWeek * Math.max(0, sum('fried') - rule('P.friedMaxPerWeek') * share);
    // R17 E3, E5: free sugars and saturated fat — hard on the weekly average (soft hints without numbers for E28).
    const energy = sum('energy');
    if (energy > 0) {
      const sugarShare = (sum('freeSugars') * 4) / energy;
      const sfaShare = (sum('satFat') * 9) / energy;
      const sugarMax = ctx.profile.safety.dishRules.has('limitAddedSugar')
        ? rule('G.limitAddedSugarFreeSugarsMaxShare')
        : rule('E3.freeSugarsMaxShare');
      c += C.weeklyHard * sq(Math.max(0, sugarShare - sugarMax) / sugarMax);
      c +=
        C.weeklyHard *
        sq(Math.max(0, sfaShare - rule('E5.satFatMaxShare')) / rule('E5.satFatMaxShare'));
    }
    if (ctx.pregnantOrLactating) c += C.pregnancyFish * fishCapExcess(sum);
    ctx.rules.frequency.forEach((r, i) => {
      const n = aggs.reduce((s, a) => s + (a.freq[i] ?? 0), 0);
      c += C.frequencyRule * (Math.max(0, r.min * share - n) + Math.max(0, n - r.max * share));
    });
  }
  return c;
}

/** R17 E9: «best» fish ≤ 340 g OR «good» ≤ 113 g a week (as one budget), oily fish ≤ 2, tuna ≤ 2 servings. */
function fishCapExcess(
  sum: (key: 'bestFishG' | 'goodFishG' | 'oilyFishServ' | 'tunaServ') => number,
): number {
  const budget =
    sum('bestFishG') / rule('E9.bestFishMaxGWeek') + sum('goodFishG') / rule('E9.goodFishMaxGWeek');
  return (
    Math.max(0, budget - 1) +
    Math.max(0, sum('oilyFishServ') - rule('E9.oilyFishMaxServingsWeek')) +
    Math.max(0, sum('tunaServ') - rule('E9.tunaMaxServingsWeek'))
  );
}

// ---------------------------------------------------------------- variety

const REPEAT_ROLES = new Set(['main', 'soup', 'salad', 'side', 'snack', 'dessert']);
/** Fruit and dairy may repeat in a week, not in the same meal on two days running nor twice a day. */
const COMPONENT_ROLES = new Set(['fruit', 'dairy']);

export function repeatWindow(role: string): number {
  switch (role) {
    case 'main':
    case 'soup':
      return rule('E19.repeatWindowDays');
    case 'salad':
      return rule('P.repeatWindowDays.salad');
    case 'side':
      return rule('P.repeatWindowDays.side');
    case 'snack':
      return rule('P.repeatWindowDays.snack');
    case 'dessert':
      return rule('P.repeatWindowDays.dessert');
    case 'fruit':
    case 'dairy':
      return rule('P.repeatWindowDays.component');
    default:
      return 0;
  }
}

export function varietyCost(ctx: PlanContext, days: readonly DayState[]): number {
  const C = ctx.costs;
  let c = 0;
  // Same item in the same meal kind within its window; mains and soups also not on two days in a row.
  const seen = new Map<string, number[]>();
  const byFood = new Map<number, number[]>();
  const proteinWeek = new Map<string, number>();
  days.forEach((day, d) => {
    const today = new Set<number>();
    day.meals.forEach((slots, m) => {
      const kind = ctx.structure[m]?.kind ?? 'snack';
      for (const slot of slots) {
        const food = ctx.foods[slot.food];
        if (!food) continue;
        const component = COMPONENT_ROLES.has(food.role);
        if (!component && !REPEAT_ROLES.has(food.role)) continue;
        // The same dish twice in one day (pasta at lunch and at dinner).
        if (today.has(slot.food)) c += C.repeat * (component ? 0.15 : 0.5);
        today.add(slot.food);
        const key = `${kind}|${slot.food}`;
        const list = seen.get(key) ?? [];
        list.push(d);
        seen.set(key, list);
        if (food.role === 'main' || food.role === 'soup') {
          const any = byFood.get(slot.food) ?? [];
          any.push(d);
          byFood.set(slot.food, any);
        }
        if (slot.kind === 'core' && food.mainProtein !== 'none') {
          const pk = `${day.week}|${kind}|${food.mainProtein}`;
          proteinWeek.set(pk, (proteinWeek.get(pk) ?? 0) + 1);
        }
      }
    });
  });
  for (const [key, list] of seen) {
    const food = ctx.foods[Number(key.slice(key.indexOf('|') + 1))];
    const window = food ? repeatWindow(food.role) : 0;
    for (let i = 1; i < list.length; i += 1) {
      if ((list[i] ?? 0) - (list[i - 1] ?? 0) < window)
        c +=
          C.repeat *
          (food?.role === 'main' || food?.role === 'soup'
            ? 1
            : food && COMPONENT_ROLES.has(food.role)
              ? 0.1
              : 0.5);
    }
  }
  const anyMeal = rule('P.repeatAnyMealDays');
  for (const list of byFood.values()) {
    const unique = [...new Set(list)];
    for (let i = 1; i < unique.length; i += 1)
      if ((unique[i] ?? 0) - (unique[i - 1] ?? 0) < anyMeal) c += C.consecutive;
  }
  // The same starch for the same meal on consecutive days (pasta, pasta).
  const starchByMeal = new Map<string, number[]>();
  days.forEach((day, d) => {
    day.meals.forEach((slots, m) => {
      const core = slots.find((s) => s.kind === 'core');
      const base = core ? ctx.foods[core.food]?.features.carbBase : undefined;
      if (!base || base === 'none') return;
      const key = `${m}|${base}`;
      const list = starchByMeal.get(key) ?? [];
      list.push(d);
      starchByMeal.set(key, list);
    });
  });
  for (const list of starchByMeal.values()) {
    for (let i = 1; i < list.length; i += 1)
      if ((list[i] ?? 0) - (list[i - 1] ?? 0) === 1) c += C.habit * 0.3;
  }
  for (const n of proteinWeek.values())
    c += C.proteinWeek * Math.max(0, n - rule('E19.proteinBaseMaxPerWeekPerMeal'));
  // Cuisine streaks of main dishes in time order.
  let last: string | null = null;
  let run = 0;
  for (const day of days) {
    day.meals.forEach((slots) => {
      const core = slots.find((s) => s.kind === 'core');
      const food = core ? ctx.foods[core.food] : undefined;
      if (!food || food.role !== 'main') return;
      const cuisine = food.cuisine;
      if (cuisine && cuisine === last) {
        run += 1;
        if (run > rule('P.cuisineStreakMax')) c += C.cuisineStreak;
      } else {
        last = cuisine;
        run = 1;
      }
    });
  }
  return c;
}

export function totalCost(ctx: PlanContext, state: PlannerState): number {
  let c = 0;
  for (const d of state.days) if (!d.history) c += d.dayCost;
  return c + weekCosts(ctx, state.days) + varietyCost(ctx, state.days);
}

// ---------------------------------------------------------------- hard checks for a candidate

/** Pregnancy fish caps over the candidate's week, with the candidate in place (R17 E9). */
function fishCapsOk(ctx: PlanContext, state: PlannerState, day: DayState): boolean {
  if (!ctx.pregnantOrLactating) return true;
  const week = state.days.filter((d) => d.week === day.week);
  const aggs = week
    .map((d) => (d === day ? aggregate(ctx, d) : d.agg))
    .filter((a): a is DayAgg => a !== null);
  const sum = (key: 'bestFishG' | 'goodFishG' | 'oilyFishServ' | 'tunaServ') =>
    aggs.reduce((s, a) => s + a[key], 0);
  return fishCapExcess(sum) <= 1e-9;
}

export function candidateOk(
  ctx: PlanContext,
  day: DayState,
  mealIndex: number,
  food: number,
  except?: Slot,
): boolean {
  if (!allowedAt(ctx, food, day.date, mealIndex)) return false;
  const slots = day.meals[mealIndex] ?? [];
  if (slots.some((s) => s !== except && s.food === food)) return false;
  const caffeine = ctx.foods[food]?.caffeineMg ?? 0;
  const minFactor = ctx.grids[food]?.[0] ?? 1;
  if (caffeine * minFactor > ctx.profile.targets.caffeineSingleMaxMg + 1e-9) return false;
  return true;
}

// ---------------------------------------------------------------- construction

const TOP_K_WEIGHTS = [0.45, 0.25, 0.18, 0.12];

function pickTop(rng: Random, ranked: readonly number[]): number | undefined {
  const k = Math.min(ranked.length, TOP_K_WEIGHTS.length);
  if (k === 0) return undefined;
  const total = TOP_K_WEIGHTS.slice(0, k).reduce((s, w) => s + w, 0);
  let u = rng.next() * total;
  for (let i = 0; i < k; i += 1) {
    u -= TOP_K_WEIGHTS[i] ?? 0;
    if (u <= 0) return ranked[i];
  }
  return ranked[k - 1];
}

/** Share of the meal's energy the core dish usually carries (lunch also has soup and a side). */
const CORE_SHARE = { breakfast: 0.7, lunch: 0.5, dinner: 0.65, snack: 0.9 } as const;

function heuristic(
  ctx: PlanContext,
  state: PlannerState,
  dayIndex: number,
  mealIndex: number,
  kind: SlotKind,
  food: number,
): number {
  const day = state.days[dayIndex];
  const meal = ctx.structure[mealIndex];
  const f = ctx.foods[food];
  if (!day || !meal || !f) return Number.POSITIVE_INFINITY;
  const C = ctx.costs;
  let h = slotCost(ctx, day, mealIndex, { kind, food, fi: 0, frozen: false, pinnedBy: null });
  // Repeats against the days already built and the history.
  const window = repeatWindow(f.role);
  for (let back = 1; back <= Math.max(window, 1); back += 1) {
    const prev = state.days[dayIndex - back];
    if (!prev) break;
    if (back < window && (prev.meals[mealIndex] ?? []).some((s) => s.food === food)) h += C.repeat;
    if (
      back === 1 &&
      (f.role === 'main' || f.role === 'soup') &&
      prev.meals.some((ss) => ss.some((s) => s.food === food))
    )
      h += C.consecutive;
  }
  // Look-ahead on the week's quotas.
  const weekDays = state.days.filter((d) => d.week === day.week && d.agg);
  const sum = (key: 'fishG' | 'redMeatRawG' | 'legumesServ' | 'fried') =>
    weekDays.reduce((s, d) => s + (d.agg?.[key] ?? 0), 0);
  const left = 7 - weekDays.length;
  if (ctx.fishAllowed && f.groups.fishG > 0 && sum('fishG') < rule('E10.fishTargetGWeek'))
    h -= (C.fishWeek * 0.3 * 7) / (left + 4);
  if (
    f.groups.redMeatRawG > 0 &&
    sum('redMeatRawG') * rule('E22.redMeatCookedPerRawG') >= rule('E22.redMeatMaxCookedGWeek') * 0.8
  )
    h += C.redMeatWeek * 0.5;
  if (f.groups.legumesG > 0 && sum('legumesServ') < rule('P.legumesMinServingsWeek'))
    h -= (C.legumesWeek * 0.4 * 7) / (left + 4);
  if (f.fried && sum('fried') >= rule('P.friedMaxPerWeek')) h += C.friedWeek;
  if (
    f.role === 'dessert' &&
    day.meals.some((ss) => ss.some((s) => ctx.foods[s.food]?.role === 'dessert'))
  )
    h += C.dessertDay;
  // Can a portion of it fill its part of the meal?
  if (kind === 'core') {
    const target =
      (ctx.shares[mealIndex] ?? 0) * ctx.profile.targets.energyKcal * CORE_SHARE[meal.kind];
    const e = ctx.q[food]?.[0] ?? 0;
    const grid = ctx.grids[food] ?? [1];
    if (target > 0 && e > 0) {
      const best = Math.min(grid[grid.length - 1] ?? 1, Math.max(grid[0] ?? 1, target / e));
      h += 3 * sq((e * best - target) / target);
    }
    // The other main meal already has this protein.
    if (meal.kind === 'lunch' || meal.kind === 'dinner') {
      const other = day.meals.some((ss, m) => {
        const k = ctx.structure[m]?.kind;
        if (m === mealIndex || (k !== 'lunch' && k !== 'dinner')) return false;
        const core = ss.find((s) => s.kind === 'core');
        return (
          core !== undefined &&
          ctx.foods[core.food]?.mainProtein === f.mainProtein &&
          f.mainProtein !== 'none'
        );
      });
      if (other) h += C.sameProtein;
    }
  }
  return h;
}

function rankCandidates(
  ctx: PlanContext,
  state: PlannerState,
  dayIndex: number,
  mealIndex: number,
  kind: SlotKind,
): number[] {
  const day = state.days[dayIndex];
  const meal = ctx.structure[mealIndex];
  if (!day || !meal) return [];
  const pool = ctx.pools[meal.kind][kind] ?? [];
  return pool
    .filter((food) => candidateOk(ctx, day, mealIndex, food))
    .map((food) => [food, heuristic(ctx, state, dayIndex, mealIndex, kind, food)] as const)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([food]) => food);
}

const standardIndex = (ctx: PlanContext, food: number): number => {
  const grid = ctx.grids[food] ?? [1];
  const i = grid.indexOf(1);
  return i >= 0 ? i : 0;
};

function addSlot(
  ctx: PlanContext,
  day: DayState,
  mealIndex: number,
  kind: SlotKind,
  food: number,
  pinnedBy: string | null = null,
): void {
  const slots = day.meals[mealIndex];
  if (!slots) return;
  slots.push({ kind, food, fi: standardIndex(ctx, food), frozen: false, pinnedBy });
}

/** Template rule: a side only next to a main without its own starch (never «пельмени + макароны»). */
function normalizeMeal(ctx: PlanContext, day: DayState, mealIndex: number): void {
  const slots = day.meals[mealIndex];
  if (!slots) return;
  const core = slots.find((s) => s.kind === 'core');
  const needsSide = core ? ctx.foods[core.food]?.needsSide === true : false;
  if (!needsSide)
    day.meals[mealIndex] = slots.filter(
      (s) => s.kind !== 'side' || s.frozen || s.pinnedBy !== null,
    );
}

export const sideAllowed = (ctx: PlanContext, slots: readonly Slot[]): boolean => {
  const core = slots.find((s) => s.kind === 'core');
  return core ? ctx.foods[core.food]?.needsSide === true : false;
};

function mealEnergyEstimate(ctx: PlanContext, slots: readonly Slot[]): number {
  return slots.reduce((s, slot) => s + (ctx.q[slot.food]?.[0] ?? 0), 0);
}

/** Optional slots in the order they are switched on when the meal needs more energy. */
function optionalOrder(ctx: PlanContext, mealIndex: number): SlotSpec[] {
  const meal = ctx.structure[mealIndex];
  if (!meal) return [];
  return MEAL_SLOTS[meal.kind]
    .filter((s) => s.slot !== 'core' && s.slot !== 'side')
    .sort((a, b) => a.presence - a.absence - (b.presence - b.absence) || a.display - b.display);
}

export function constructDay(
  ctx: PlanContext,
  state: PlannerState,
  dayIndex: number,
  rng: Random,
): void {
  const day = state.days[dayIndex];
  if (!day || day.history) return;
  ctx.structure.forEach((meal, m) => {
    const slots = day.meals[m] ?? [];
    day.meals[m] = slots;
    const has = (kind: SlotKind) => slots.some((s) => s.kind === kind);
    // Rules that pin an item to this meal come first.
    for (const inc of ctx.rules.includes) {
      if (!inc.meals?.includes(meal.kind) || !inc.appliesTo(day.date, meal.kind)) continue;
      if (slots.some((s) => inc.foods.has(s.food))) continue;
      const choice = [...inc.foods].find((food) => candidateOk(ctx, day, m, food));
      const f = choice !== undefined ? ctx.foods[choice] : undefined;
      if (choice === undefined || !f) continue;
      const kind = MEAL_SLOTS[meal.kind].find(
        (s) => s.roles.includes(f.role) && !has(s.slot),
      )?.slot;
      if (kind && slots.length < MAX_ITEMS_PER_MEAL) addSlot(ctx, day, m, kind, choice, inc.ruleId);
    }
    if (!has('core')) {
      const pick = pickTop(rng, rankCandidates(ctx, state, dayIndex, m, 'core'));
      if (pick !== undefined) addSlot(ctx, day, m, 'core', pick);
    }
    const core = slots.find((s) => s.kind === 'core');
    const coreFood = core ? ctx.foods[core.food] : undefined;
    if (
      (meal.kind === 'lunch' || meal.kind === 'dinner') &&
      coreFood?.needsSide &&
      !has('side') &&
      slots.length < MAX_ITEMS_PER_MEAL
    ) {
      const side = pickTop(rng, rankCandidates(ctx, state, dayIndex, m, 'side'));
      if (side !== undefined) addSlot(ctx, day, m, 'side', side);
      else {
        const salad = pickTop(rng, rankCandidates(ctx, state, dayIndex, m, 'salad'));
        if (salad !== undefined) addSlot(ctx, day, m, 'salad', salad);
      }
    }
    const target = (ctx.shares[m] ?? 0) * ctx.profile.targets.energyKcal;
    for (const spec of optionalOrder(ctx, m)) {
      if (slots.length >= MAX_ITEMS_PER_MEAL) break;
      if (has(spec.slot)) continue;
      const habitual = spec.absence > spec.presence;
      if (!habitual && mealEnergyEstimate(ctx, slots) >= target * 0.9) continue;
      const pick = pickTop(rng, rankCandidates(ctx, state, dayIndex, m, spec.slot));
      if (pick !== undefined) addSlot(ctx, day, m, spec.slot, pick);
    }
    normalizeMeal(ctx, day, m);
  });
  refreshDay(ctx, day);
}

// ---------------------------------------------------------------- local search

type Snapshot = {
  day: DayState;
  meals: Slot[][];
  solution: DaySolution | null;
  agg: DayAgg | null;
  dayCost: number;
};

const snapshot = (day: DayState): Snapshot => ({
  day,
  meals: day.meals.map((slots) => slots.map((s) => ({ ...s }))),
  solution: day.solution,
  agg: day.agg,
  dayCost: day.dayCost,
});

function restore(s: Snapshot): void {
  s.day.meals = s.meals;
  s.day.solution = s.solution;
  s.day.agg = s.agg;
  s.day.dayCost = s.dayCost;
}

/** e^(−x) through a rational approximation: arithmetic only, so acceptance is identical on every engine. */
const acceptance = (x: number) => 1 / (1 + x + (x * x) / 2 + (x * x * x) / 6);

export type SearchStats = {
  iterations: number;
  accepted: number;
  improved: number;
  finalCost: number;
};

export function localSearch(
  ctx: PlanContext,
  state: PlannerState,
  rng: Random,
  iterations: number,
): SearchStats {
  const editable = state.days.map((d, i) => [d, i] as const).filter(([d]) => !d.history);
  let cost = totalCost(ctx, state);
  const stats: SearchStats = { iterations, accepted: 0, improved: 0, finalCost: cost };
  if (editable.length === 0 || iterations <= 0) return stats;
  const t0 = 1;
  const t1 = 0.02;
  for (let k = 0; k < iterations; k += 1) {
    const temperature = t0 - ((t0 - t1) * k) / iterations;
    const roll = rng.next();
    const [day] = editable[rng.int(editable.length)] ?? [];
    if (!day) continue;
    const m = rng.int(ctx.structure.length);
    const meal = ctx.structure[m];
    const slots = day.meals[m];
    if (!meal || !slots) continue;
    let touched: Snapshot[];
    if (roll < 0.5) {
      // Replace an item.
      const movable = slots.filter((s) => !s.frozen && s.pinnedBy === null);
      const slot = movable[rng.int(movable.length)];
      const pool = slot ? (ctx.pools[meal.kind][slot.kind] ?? []) : [];
      if (!slot || pool.length < 2) continue;
      const food = pool[rng.int(pool.length)];
      if (food === undefined || food === slot.food || !candidateOk(ctx, day, m, food, slot))
        continue;
      touched = [snapshot(day)];
      const index = slots.indexOf(slot);
      const replaced = day.meals[m]?.[index];
      if (replaced) {
        replaced.food = food;
        replaced.fi = standardIndex(ctx, food);
      }
      normalizeMeal(ctx, day, m);
    } else if (roll < 0.75) {
      // Switch an optional slot on or off.
      const options = MEAL_SLOTS[meal.kind].filter((s) => s.slot !== 'core');
      const spec = options[rng.int(options.length)];
      if (!spec) continue;
      const existing = slots.find((s) => s.kind === spec.slot);
      if (existing) {
        if (existing.frozen || existing.pinnedBy !== null) continue;
        touched = [snapshot(day)];
        day.meals[m] = slots.filter((s) => s !== existing);
      } else {
        if (slots.length >= MAX_ITEMS_PER_MEAL) continue;
        if (spec.slot === 'side' && !sideAllowed(ctx, slots)) continue;
        const pool = (ctx.pools[meal.kind][spec.slot] ?? []).filter((f) =>
          candidateOk(ctx, day, m, f),
        );
        const food = pool[rng.int(pool.length)];
        if (food === undefined) continue;
        touched = [snapshot(day)];
        addSlot(ctx, day, m, spec.slot, food);
      }
    } else {
      // Swap this meal with the same meal of another day.
      const [other] = editable[rng.int(editable.length)] ?? [];
      const otherSlots = other?.meals[m];
      if (!other || other === day || !otherSlots) continue;
      if (
        slots.some((s) => s.frozen || s.pinnedBy !== null) ||
        otherSlots.some((s) => s.frozen || s.pinnedBy !== null)
      )
        continue;
      if (
        !otherSlots.every((s) => allowedAt(ctx, s.food, day.date, m)) ||
        !slots.every((s) => allowedAt(ctx, s.food, other.date, m))
      )
        continue;
      touched = [snapshot(day), snapshot(other)];
      day.meals[m] = otherSlots.map((s) => ({ ...s }));
      other.meals[m] = slots.map((s) => ({ ...s }));
    }
    for (const t of touched) refreshDay(ctx, t.day);
    if (!touched.every((t) => fishCapsOk(ctx, state, t.day))) {
      touched.forEach(restore);
      continue;
    }
    const next = totalCost(ctx, state);
    const delta = next - cost;
    if (delta <= 0 || rng.next() < acceptance(delta / temperature)) {
      if (delta < 0) stats.improved += 1;
      stats.accepted += 1;
      cost = next;
    } else {
      touched.forEach(restore);
    }
  }
  stats.finalCost = cost;
  return stats;
}

// ---------------------------------------------------------------- state from and to plans

export function stateFromHistory(ctx: PlanContext, history: readonly DayPlan[]): DayState[] {
  return history.map((plan): DayState => {
    const meals = ctx.structure.map((meal) => {
      const items = plan.meals[meal.id] ?? [];
      return items.flatMap((item): Slot[] => {
        const food = ctx.indexOf.get(item.itemId);
        const grid = food !== undefined ? ctx.grids[food] : undefined;
        if (food === undefined || !grid) return [];
        const fi = grid.reduce(
          (best, f, i) =>
            Math.abs(f - item.portion.factor) < Math.abs((grid[best] ?? 1) - item.portion.factor)
              ? i
              : best,
          0,
        );
        const spec = MEAL_SLOTS[meal.kind].find((s) => s.roles.includes(item.role));
        return [
          { kind: spec?.slot ?? 'extra', food, fi, frozen: true, pinnedBy: item.pinnedBy ?? null },
        ];
      });
    });
    const day: DayState = {
      date: plan.date,
      week: weekKey(plan.date),
      weekday: isWeekday(plan.date),
      history: true,
      meals,
      solution: null,
      agg: null,
      dayCost: 0,
    };
    day.agg = aggregate(ctx, day);
    return day;
  });
}

export const emptyDay = (ctx: PlanContext, date: IsoDate): DayState => ({
  date,
  week: weekKey(date),
  weekday: isWeekday(date),
  history: false,
  meals: ctx.structure.map(() => []),
  solution: null,
  agg: null,
  dayCost: 0,
});

export type { MealId };

// ---------------------------------------------------------------- deterministic polish

/**
 * Hill climbing after the annealing: every optional slot of every day is tried on and off, every movable item is
 * tried against its best few candidates; a change stays only if the whole plan's cost drops. Catches the obvious
 * moves the random search may have missed (tea at breakfast) without randomness.
 */
export function polish(ctx: PlanContext, state: PlannerState, candidatesPerSlot = 6): number {
  let cost = totalCost(ctx, state);
  let changes = 0;
  const tryChange = (touched: DayState[], apply: () => void): boolean => {
    const saved = touched.map(snapshot);
    apply();
    for (const d of touched) refreshDay(ctx, d);
    const next = totalCost(ctx, state);
    if (next < cost - 1e-9 && touched.every((d) => fishCapsOk(ctx, state, d))) {
      cost = next;
      changes += 1;
      return true;
    }
    saved.forEach(restore);
    return false;
  };
  state.days.forEach((day, d) => {
    if (day.history) return;
    ctx.structure.forEach((meal, m) => {
      for (const spec of MEAL_SLOTS[meal.kind]) {
        if (spec.slot === 'core') continue;
        const slots = day.meals[m] ?? [];
        const existing = slots.find((s) => s.kind === spec.slot);
        if (existing) {
          if (!existing.frozen && existing.pinnedBy === null)
            tryChange([day], () => {
              day.meals[m] = (day.meals[m] ?? []).filter((s) => s !== existing);
            });
        } else if (
          slots.length < MAX_ITEMS_PER_MEAL &&
          (spec.slot !== 'side' || sideAllowed(ctx, slots))
        ) {
          for (const food of rankCandidates(ctx, state, d, m, spec.slot).slice(0, 3)) {
            const added = tryChange([day], () => {
              addSlot(ctx, day, m, spec.slot, food);
            });
            if (added) break;
          }
        }
      }
      for (const slot of [...(day.meals[m] ?? [])]) {
        if (slot.frozen || slot.pinnedBy !== null) continue;
        const ranked = rankCandidates(ctx, state, d, m, slot.kind).filter((f) => f !== slot.food);
        for (const food of ranked.slice(0, candidatesPerSlot)) {
          const index = (day.meals[m] ?? []).findIndex(
            (s) => s.kind === slot.kind && s.food === slot.food,
          );
          if (index < 0) break;
          const done = tryChange([day], () => {
            const target = day.meals[m]?.[index];
            if (target) {
              target.food = food;
              target.fi = standardIndex(ctx, food);
            }
            normalizeMeal(ctx, day, m);
          });
          if (done) break;
        }
      }
    });
  });
  return changes;
}

export type CostBreakdown = {
  readonly nutrition: number;
  readonly slots: number;
  readonly habits: number;
  readonly dayExtras: number;
  readonly weeks: number;
  readonly variety: number;
};

/** Where the plan's cost comes from (the simulation report and tuning). */
export function costBreakdown(ctx: PlanContext, state: PlannerState): CostBreakdown {
  let nutrition = 0;
  let slots = 0;
  let habits = 0;
  let extras = 0;
  for (const day of state.days) {
    if (day.history || !day.agg) continue;
    nutrition += day.solution?.cost ?? 0;
    extras += dayExtras(ctx, day, day.agg);
    day.meals.forEach((list, m) => {
      for (const slot of list) slots += slotCost(ctx, day, m, slot);
      habits += mealHabitCost(ctx, m, list);
    });
  }
  return {
    nutrition,
    slots,
    habits,
    dayExtras: extras,
    weeks: weekCosts(ctx, state.days),
    variety: varietyCost(ctx, state.days),
  };
}
