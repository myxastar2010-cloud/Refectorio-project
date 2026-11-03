/**
 * Everything the planner derives once per (person, food data, structure, rules): candidate pools per meal and slot,
 * tracked vectors, portion grids, P(like), compiled DSL rules and cost weights. Food items are referred to by their
 * index in `foods` inside the planner (fast), by id everywhere else.
 */
import type { NutrientKey } from '@refectorio/food-data';
import { addDays, dateRange, weekStart, weekdayIndex, type IsoDate } from './dates';
import { inDays, inMeals, matcher, type Rule, type RuleConflict } from './dsl';
import { checkFood, type Verdict } from './filter';
import { portionGrid, type FoodIndex, type MenuFood } from './foods';
import {
  BASE_WEIGHTS,
  Q,
  Q_NUTRIENT,
  QN,
  trackedVector,
  type NutrientLimit,
  type Weights,
} from './portions';
import type { MenuProfile } from './profile';
import { rule } from './rules';
import { isMainMeal, mealHours, mealShares } from './structure';
import { likeProbability } from './taste';
import { MEAL_SLOTS, type SlotKind } from './templates';
import { MEAL_KINDS, type Meal, type MealKind, type Portion } from './types';

/** Costs outside the day's nutrition (taste, habits, context, quotas, variety); see `costs.ts`. */
export type CostWeights = {
  readonly taste: number;
  readonly habit: number;
  readonly boxable: number;
  readonly cookTime: number;
  readonly sleepDinner: number;
  readonly eveningCaffeine: number;
  readonly processedItem: number;
  readonly repeat: number;
  readonly consecutive: number;
  readonly sameProtein: number;
  readonly proteinWeek: number;
  readonly cuisineStreak: number;
  readonly fishWeek: number;
  readonly redMeatWeek: number;
  readonly processedWeek: number;
  readonly legumesWeek: number;
  readonly nutsWeek: number;
  readonly friedWeek: number;
  readonly dessertDay: number;
  readonly dairyDay: number;
  readonly wholeGrainDay: number;
  readonly weeklyHard: number;
  readonly pregnancyFish: number;
  readonly frequencyRule: number;
  readonly includeRule: number;
  readonly prefer: number;
  readonly replaceTo: number;
};

export const BASE_COST_WEIGHTS: CostWeights = {
  taste: 2.5,
  habit: 1,
  boxable: 0.8,
  cookTime: 0.6,
  sleepDinner: 0.8,
  eveningCaffeine: 1,
  processedItem: 0.8,
  repeat: 6,
  consecutive: 3,
  sameProtein: 1.5,
  proteinWeek: 1,
  cuisineStreak: 0.8,
  fishWeek: 4,
  redMeatWeek: 4,
  processedWeek: 1.5,
  legumesWeek: 1.5,
  nutsWeek: 1,
  friedWeek: 1,
  dessertDay: 2,
  dairyDay: 1,
  wholeGrainDay: 1,
  weeklyHard: 400,
  pregnancyFish: 1000,
  frequencyRule: 5,
  includeRule: 20,
  prefer: 0.8,
  replaceTo: 0.5,
};

/** How much taste counts by slot: the core dish most (whatever its role), bread and drinks little. */
export const SLOT_TASTE: Readonly<Record<SlotKind, number>> = {
  core: 1,
  soup: 0.8,
  salad: 0.6,
  side: 0.5,
  extra: 0.5,
  fruit: 0.4,
  dairy: 0.4,
  drink: 0.35,
  bread: 0.2,
};

type Excluder = {
  readonly ruleId: string;
  readonly test: (food: number, date: IsoDate, meal: MealKind) => boolean;
};
export type IncludeRule = {
  readonly ruleId: string;
  readonly foods: ReadonlySet<number>;
  readonly appliesTo: (date: IsoDate, meal: MealKind) => boolean;
  readonly meals: readonly MealKind[] | null;
  readonly createdBy: 'user' | 'kiki';
};
export type FrequencyRule = {
  readonly ruleId: string;
  readonly foods: ReadonlySet<number>;
  readonly min: number;
  readonly max: number;
};
export type PreferRule = {
  readonly foods: ReadonlySet<number>;
  readonly sign: 1 | -1;
  readonly appliesTo: (date: IsoDate, meal: MealKind) => boolean;
  readonly createdBy: 'user' | 'kiki';
};
export type LimitRule = {
  readonly ruleId: string;
  readonly q: number;
  readonly per: 'day' | 'meal';
  readonly min?: number;
  readonly max?: number;
  readonly appliesTo: (date: IsoDate, meal: MealKind) => boolean;
};

export type CompiledRules = {
  readonly excluders: readonly Excluder[];
  readonly includes: readonly IncludeRule[];
  readonly frequency: readonly FrequencyRule[];
  readonly prefer: readonly PreferRule[];
  readonly limits: readonly LimitRule[];
  /** Nutrients beyond the solver's base vector that DSL limits name. */
  readonly extraNutrients: readonly NutrientKey[];
  readonly conflicts: readonly RuleConflict[];
};

export type PlanContext = {
  readonly profile: MenuProfile;
  readonly foods: readonly MenuFood[];
  readonly indexOf: ReadonlyMap<string, number>;
  readonly verdicts: readonly (Verdict | null)[];
  readonly q: readonly Float64Array[];
  readonly grids: readonly (readonly number[])[];
  readonly portions: readonly (readonly Portion[])[];
  readonly pLike: Float64Array;
  /** Allowed foods per meal kind and slot (hard filter, meal type), ascending by index. */
  readonly pools: Readonly<
    Record<MealKind, Readonly<Partial<Record<SlotKind, readonly number[]>>>>
  >;
  readonly structure: readonly Meal[];
  readonly shares: readonly number[];
  readonly hours: readonly number[];
  readonly mainMeal: readonly boolean[];
  readonly rules: CompiledRules;
  readonly weights: Weights;
  readonly costs: CostWeights;
  /** Caffeine at a meal after the cut-off is excluded for the «sleep» goal (R17 E14). */
  readonly caffeineCutoffHour: { readonly small: number; readonly large: number } | null;
  readonly fishAllowed: boolean;
  readonly nutsAllowed: boolean;
  readonly dairyAllowed: boolean;
  readonly pregnantOrLactating: boolean;
  /** Columns of the weekly fish budget in `q` (R17 E9), for a pregnant or breastfeeding person only. */
  readonly fishQ: FishColumns | null;
};

export type FishColumns = { readonly budget: number; readonly oily: number; readonly tuna: number };

/**
 * One portion's share of the weekly fish budget in pregnancy and breastfeeding (R17 E9): «best» fish against 340 g,
 * anything else — «good» or an unknown species — against the stricter 113 g.
 */
export function fishBudgetShare(food: MenuFood): number {
  const fish = food.groups.fishG;
  if (fish <= 0) return 0;
  return (
    fish /
    (food.item.fishMercury === 'best' ? rule('E9.bestFishMaxGWeek') : rule('E9.goodFishMaxGWeek'))
  );
}

/** The other two weekly caps of R17 E9, in servings: oily fish and tuna. */
export const fishServings = (food: MenuFood): { oily: number; tuna: number } => ({
  oily: food.groups.oilyFishG / rule('E9.fishServingG'),
  tuna: food.groups.tunaG / rule('E9.fishServingG'),
});

/** Per-person adjustments of the nutrition weights (extra goals, guardrail dish rules). */
export function weightsFor(profile: MenuProfile): Weights {
  const g = profile.extraGoals;
  const r = profile.safety.dishRules;
  const fitness = g.has('fitness') ? 2 : 1;
  const health = g.has('overallHealth') ? 1.5 : 1;
  const steady = g.has('energy') ? 1.5 : 1;
  return {
    ...BASE_WEIGHTS,
    protein: BASE_WEIGHTS.protein * fitness,
    mealProtein: BASE_WEIGHTS.mealProtein * fitness,
    vegFruit: BASE_WEIGHTS.vegFruit * health,
    fibre: BASE_WEIGHTS.fibre * health,
    fibreTarget: BASE_WEIGHTS.fibreTarget * health,
    sodium: BASE_WEIGHTS.sodium * health * (r.has('limitSodium') ? 3 : 1),
    sugar: BASE_WEIGHTS.sugar * health * (r.has('limitAddedSugar') ? 2 : 1),
    sugarGoal: BASE_WEIGHTS.sugarGoal * health * (r.has('limitAddedSugar') ? 2 : 1),
    share: BASE_WEIGHTS.share * steady,
    shareSoft: BASE_WEIGHTS.shareSoft * steady * steady,
  };
}

const foodView = (f: MenuFood) => ({
  id: f.id,
  categories: f.categories,
  ingredientIds: new Set(f.item.ingredients.map((i) => i.id)),
});

const scopeOf = (r: Rule) => (date: IsoDate, meal: MealKind) =>
  inDays(r.days, date) && inMeals(r.meals, meal);

export function compileRules(
  rules: readonly Rule[],
  foods: readonly MenuFood[],
  verdicts: readonly (Verdict | null)[],
): CompiledRules {
  const excluders: Excluder[] = [];
  const includes: IncludeRule[] = [];
  const frequency: FrequencyRule[] = [];
  const prefer: PreferRule[] = [];
  const limits: LimitRule[] = [];
  const extra: NutrientKey[] = [];
  const conflicts: RuleConflict[] = [];
  const views = foods.map(foodView);
  const knownIngredients = new Set(foods.flatMap((f) => f.item.ingredients.map((i) => i.id)));
  const select = (r: Rule & { target: Parameters<typeof matcher>[0] }) => {
    const test = matcher(r.target);
    const set = new Set<number>();
    views.forEach((v, i) => {
      if (test(v)) set.add(i);
    });
    if (set.size === 0) {
      const unknown =
        ('itemId' in r.target &&
          !foods.some((f) => f.id === (r.target as { itemId: string }).itemId)) ||
        ('ingredientId' in r.target && !knownIngredients.has(r.target.ingredientId));
      conflicts.push({ ruleId: r.id, code: unknown ? 'RULE_UNKNOWN_TARGET' : 'RULE_INFEASIBLE' });
    }
    return set;
  };
  const qOf = (nutrient: NutrientKey): number => {
    const base = Q_NUTRIENT.indexOf(nutrient);
    if (base >= 0) return base;
    let i = extra.indexOf(nutrient);
    if (i < 0) {
      extra.push(nutrient);
      i = extra.length - 1;
    }
    return QN + i;
  };
  for (const r of rules) {
    if (!r.active) continue;
    const appliesTo = scopeOf(r);
    switch (r.kind) {
      case 'excludeIngredient': {
        const set = select(r);
        excluders.push({
          ruleId: r.id,
          test: (food, date, meal) => set.has(food) && appliesTo(date, meal),
        });
        break;
      }
      case 'excludeItem': {
        const index = foods.findIndex((f) => f.id === r.itemId);
        if (index < 0)
          conflicts.push({ ruleId: r.id, code: 'RULE_UNKNOWN_TARGET', detail: r.itemId });
        excluders.push({
          ruleId: r.id,
          test: (food, date, meal) => food === index && appliesTo(date, meal),
        });
        break;
      }
      case 'includeItem': {
        const all = select(r);
        const allowed = new Set([...all].filter((i) => verdicts[i]?.ok === true));
        if (all.size > 0 && allowed.size === 0) {
          const blocked = verdicts[[...all][0] ?? -1];
          conflicts.push({
            ruleId: r.id,
            code: 'RULE_CONFLICTS_SAFETY',
            ...(blocked && !blocked.ok ? { detail: blocked.reasons.join(',') } : {}),
          });
        }
        if (allowed.size > 0)
          includes.push({
            ruleId: r.id,
            foods: allowed,
            appliesTo,
            meals: r.meals ?? null,
            createdBy: r.createdBy,
          });
        break;
      }
      case 'frequency': {
        const set = select(r);
        frequency.push({
          ruleId: r.id,
          foods: set,
          min: r.minPerWeek ?? 0,
          max: r.maxPerWeek ?? 21,
        });
        break;
      }
      case 'replaceCategory': {
        const from = select({ ...r, target: { category: r.from } });
        const to = select({ ...r, target: { category: r.to } });
        excluders.push({
          ruleId: r.id,
          test: (food, date, meal) => from.has(food) && appliesTo(date, meal),
        });
        prefer.push({ foods: to, sign: -1, appliesTo, createdBy: r.createdBy });
        break;
      }
      case 'preferLess':
      case 'preferMore':
        prefer.push({
          foods: select(r),
          sign: r.kind === 'preferMore' ? -1 : 1,
          appliesTo,
          createdBy: r.createdBy,
        });
        break;
      case 'minNutrient':
      case 'maxNutrient':
        limits.push({
          ruleId: r.id,
          q: qOf(r.nutrient),
          per: r.per,
          ...(r.kind === 'minNutrient' ? { min: r.value } : { max: r.value }),
          appliesTo,
        });
        break;
      case 'goal':
      case 'mealStructure':
        conflicts.push({ ruleId: r.id, code: 'RULE_NOT_A_FILTER' });
        break;
    }
  }
  // Include and exclude the same foods on the same days and meals (checked over a reference week).
  const week = dateRange('2026-01-05', '2026-01-11');
  for (const inc of includes) {
    for (const ex of excluders) {
      const clash = [...inc.foods].every((f) =>
        week.some((d) => MEAL_KINDS.some((m) => inc.appliesTo(d, m) && ex.test(f, d, m))),
      );
      if (clash)
        conflicts.push({ ruleId: inc.ruleId, code: 'RULE_CONTRADICTS_RULE', detail: ex.ruleId });
    }
  }
  return { excluders, includes, frequency, prefer, limits, extraNutrients: extra, conflicts };
}

export function buildContext(
  profile: MenuProfile,
  index: FoodIndex,
  structure: readonly Meal[],
  rules: readonly Rule[],
): PlanContext {
  const foods = index.foods;
  const verdicts = foods.map((f) => checkFood(f, profile.safety));
  const compiled = compileRules(rules, foods, verdicts);
  const width = QN + compiled.extraNutrients.length;
  const fishQ: FishColumns | null =
    profile.safety.pregnant || profile.safety.lactating
      ? { budget: width, oily: width + 1, tuna: width + 2 }
      : null;
  const q = foods.map((f) => {
    const v = trackedVector(f, compiled.extraNutrients);
    if (!fishQ) return v;
    const out = new Float64Array(width + 3);
    out.set(v);
    const servings = fishServings(f);
    out[fishQ.budget] = fishBudgetShare(f);
    out[fishQ.oily] = servings.oily;
    out[fishQ.tuna] = servings.tuna;
    return out;
  });
  const portions = foods.map((f, i) => {
    const v = verdicts[i];
    return portionGrid(f.item, v?.ok === true && v.fixedPortion);
  });
  const grids = portions.map((list) =>
    [...new Set(list.map((p) => p.factor))].sort((a, b) => a - b),
  );
  const pLike = new Float64Array(foods.map((f) => likeProbability(f, profile.taste)));
  const pools = {} as Record<MealKind, Partial<Record<SlotKind, number[]>>>;
  for (const kind of MEAL_KINDS) {
    const bySlot: Partial<Record<SlotKind, number[]>> = {};
    for (const spec of MEAL_SLOTS[kind]) {
      bySlot[spec.slot] = foods
        .map((f, i) => [f, i] as const)
        .filter(
          ([f, i]) =>
            verdicts[i]?.ok === true &&
            spec.roles.includes(f.role) &&
            f.item.mealTypes.includes(kind),
        )
        .map(([, i]) => i);
    }
    pools[kind] = bySlot;
  }
  const sharesMap = mealShares(structure);
  const hoursMap = mealHours(structure);
  const s = profile.safety;
  const allergic = (code: 'FISH' | 'TREE_NUT' | 'PEANUT' | 'MILK') => s.allergens.has(code);
  const fishDiet =
    s.diet === 'omnivore' || s.diet === 'pescatarian' || s.diet === 'halal' || s.diet === 'kosher';
  return {
    profile,
    foods,
    indexOf: new Map(foods.map((f, i) => [f.id, i])),
    verdicts,
    q,
    grids,
    portions,
    pLike,
    pools,
    structure,
    shares: structure.map((m) => sharesMap.get(m.id) ?? 0),
    hours: structure.map((m) => hoursMap.get(m.id) ?? rule('E14.mealHour.snack')),
    mainMeal: structure.map((m) => isMainMeal(m.kind)),
    rules: compiled,
    weights: weightsFor(profile),
    costs: BASE_COST_WEIGHTS,
    caffeineCutoffHour: profile.extraGoals.has('sleep')
      ? {
          small: rule('E14.bedtimeHour') - rule('E14.caffeineCutoffHoursSmall'),
          large: rule('E14.bedtimeHour') - rule('E14.caffeineCutoffHoursLarge'),
        }
      : null,
    fishAllowed: fishDiet && !allergic('FISH') && !s.excluded.categories.has('fish'),
    nutsAllowed: !allergic('TREE_NUT') && !allergic('PEANUT') && !s.excluded.categories.has('nuts'),
    dairyAllowed:
      s.diet !== 'vegan' && s.diet !== 'lentLay' && s.diet !== 'vegetarianOvo' && !allergic('MILK'),
    pregnantOrLactating: s.pregnant || s.lactating,
    fishQ,
  };
}

/** Is food `i` allowed in this meal on this date (DSL exclusions, the sleep cut-off for caffeine)? */
export function allowedAt(
  ctx: PlanContext,
  food: number,
  date: IsoDate,
  mealIndex: number,
): boolean {
  const meal = ctx.structure[mealIndex];
  if (!meal) return false;
  for (const ex of ctx.rules.excluders) if (ex.test(food, date, meal.kind)) return false;
  const cutoff = ctx.caffeineCutoffHour;
  const caffeine = ctx.q[food]?.[Q.caffeine] ?? 0;
  if (cutoff && caffeine >= 1) {
    const hour = ctx.hours[mealIndex] ?? 0;
    const limit = caffeine > rule('E14.caffeineSmallDoseMg') ? cutoff.large : cutoff.small;
    if (hour > limit) return false;
  }
  return true;
}

export const weekKey = (date: IsoDate): IsoDate => weekStart(date);
export const isWeekday = (date: IsoDate): boolean => weekdayIndex(date) < 5;
export const nextDay = (date: IsoDate): IsoDate => addDays(date, 1);

/** The DSL limits of one day as solver limits. */
export function limitsFor(ctx: PlanContext, date: IsoDate): NutrientLimit[] {
  const out: NutrientLimit[] = [];
  for (const l of ctx.rules.limits) {
    if (l.per === 'day') {
      if (MEAL_KINDS.some((m) => l.appliesTo(date, m)))
        out.push({
          q: l.q,
          meal: -1,
          ...(l.min !== undefined ? { min: l.min } : {}),
          ...(l.max !== undefined ? { max: l.max } : {}),
        });
    } else {
      ctx.structure.forEach((meal, m) => {
        if (l.appliesTo(date, meal.kind))
          out.push({
            q: l.q,
            meal: m,
            ...(l.min !== undefined ? { min: l.min } : {}),
            ...(l.max !== undefined ? { max: l.max } : {}),
          });
      });
    }
  }
  return out;
}
