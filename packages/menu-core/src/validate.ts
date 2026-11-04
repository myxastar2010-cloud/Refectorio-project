/**
 * The validator (ТЗ фаза 3 §3.4, algorithm-spec §6): re-checks every hard rule from the composition of the finished
 * plan — never trusting the planner's pools — and turns soft misses into honest day flags. A hard violation is a bug:
 * the property tests require zero. Eaten items are facts, not advice: they are never «violations», but they count in
 * the day's and the week's limits (review of phase 3, C2).
 */
import type { NutrientVector } from '@refectorio/food-data';
import type { Diet } from '@refectorio/nutrition-core';
import { allowedAt, fishBudgetShare, fishServings, weekKey, type PlanContext } from './context';
import { checkFood, type HardReason } from './filter';
import { Q } from './portions';
import type { MenuFood } from './foods';
import { repeatWindow } from './planner';
import { rule } from './rules';
import { ingredientCategories, withAncestors, type CategoryId } from './taxonomy';
import { MAX_ITEMS_PER_MEAL } from './templates';
import { MEAL_KINDS, type DayFlag, type DayPlan, type IsoDate, type PlannedItem } from './types';
import { daysBetween } from './dates';

export type HardViolation = {
  readonly date: IsoDate;
  readonly meal: string;
  readonly itemId?: string;
  readonly code:
    | HardReason
    | 'unknownItem'
    | 'unknownMeal'
    | 'ruleExclusion'
    | 'dietByIngredients'
    | 'servedWithout'
    | 'caffeineDay'
    | 'caffeineSingle'
    | 'herbalTeaDay'
    | 'fishWeek'
    | 'tooManyItems';
};

/** An item the person already ate (meal id, item id on a date): a fact the plan has to live with. */
export type IsFact = (date: IsoDate, mealId: string, itemId: string) => boolean;
const NO_FACTS: IsFact = () => false;

function foodOf(ctx: PlanContext, itemId: string): MenuFood | undefined {
  const index = ctx.indexOf.get(itemId);
  return index !== undefined ? ctx.foods[index] : undefined;
}

/**
 * R17 E9 in pregnancy and breastfeeding: each week's fish budget over the history and the planned days. A week breaks
 * the rule only if the engine added fish to it — past days and eaten items cannot be changed.
 */
function fishWeekViolations(
  ctx: PlanContext,
  days: readonly DayPlan[],
  history: readonly DayPlan[],
  isFact: IsFact,
): HardViolation[] {
  if (!ctx.fishQ) return [];
  const planned = new Set(days.map((d) => d.date));
  const weeks = new Map<IsoDate, { budget: number; oily: number; tuna: number; fresh: boolean }>();
  for (const day of [...history.filter((d) => !planned.has(d.date)), ...days]) {
    const week = weekKey(day.date);
    const acc = weeks.get(week) ?? { budget: 0, oily: 0, tuna: 0, fresh: false };
    for (const [mealId, items] of Object.entries(day.meals)) {
      for (const item of items) {
        const food = foodOf(ctx, item.itemId);
        if (!food || fishBudgetShare(food) <= 0) continue;
        const f = item.portion.factor;
        const servings = fishServings(food);
        acc.budget += f * fishBudgetShare(food);
        acc.oily += f * servings.oily;
        acc.tuna += f * servings.tuna;
        if (planned.has(day.date) && !isFact(day.date, mealId, item.itemId)) acc.fresh = true;
      }
    }
    weeks.set(week, acc);
  }
  const out: HardViolation[] = [];
  for (const [week, acc] of weeks) {
    if (
      acc.fresh &&
      (acc.budget > 1 + 1e-6 ||
        acc.oily > rule('E9.oilyFishMaxServingsWeek') + 1e-6 ||
        acc.tuna > rule('E9.tunaMaxServingsWeek') + 1e-6)
    )
      out.push({ date: week, meal: '', code: 'fishWeek' });
  }
  return out;
}

/** Categories a diet never allows, as the ingredients say: a second path beside the item flags `checkFood` reads. */
const DIET_BANS: Partial<Record<Diet, readonly CategoryId[]>> = {
  vegan: ['meat', 'fish', 'seafood', 'eggs', 'dairy', 'honey'],
  lentLay: ['meat', 'fish', 'seafood', 'eggs', 'dairy', 'honey'],
  vegetarianLactoOvo: ['meat', 'fish', 'seafood'],
  vegetarianLacto: ['meat', 'fish', 'seafood', 'eggs'],
  vegetarianOvo: ['meat', 'fish', 'seafood', 'dairy'],
  pescatarian: ['meat'],
};

function dietBroken(food: MenuFood, diet: Diet): boolean {
  const banned = DIET_BANS[diet];
  if (!banned) return false;
  return food.item.ingredients.some((ingredient) =>
    ingredientCategories(ingredient)
      .flatMap((c) => withAncestors(c))
      .some((c) => banned.includes(c)),
  );
}

/**
 * `history` — the plan's other days (weekly caps count them); only `days` are checked item by item. `isFact` — eaten
 * items: skipped item by item, counted in the caps.
 */
export function hardViolations(
  ctx: PlanContext,
  days: readonly DayPlan[],
  history: readonly DayPlan[] = [],
  isFact: IsFact = NO_FACTS,
): HardViolation[] {
  const out: HardViolation[] = fishWeekViolations(ctx, days, history, isFact);
  const targets = ctx.profile.targets;
  const known = new Set(ctx.structure.map((m) => m.id));
  const herbalMax = ctx.profile.safety.pregnant
    ? rule('E21.herbalTeaMaxCupsDay')
    : Number.POSITIVE_INFINITY;
  for (const day of days) {
    for (const mealId of Object.keys(day.meals))
      if (!known.has(mealId)) out.push({ date: day.date, meal: mealId, code: 'unknownMeal' });
    let caffeine = 0;
    let caffeineAdded = false;
    let herbal = 0;
    let herbalAdded = false;
    for (const [m, meal] of ctx.structure.entries()) {
      const items = day.meals[meal.id] ?? [];
      if (items.length > MAX_ITEMS_PER_MEAL)
        out.push({ date: day.date, meal: meal.id, code: 'tooManyItems' });
      let mealCaffeine = 0;
      let mealCaffeineAdded = false;
      for (const item of items) {
        const index = ctx.indexOf.get(item.itemId);
        const food = index !== undefined ? ctx.foods[index] : undefined;
        if (index === undefined || !food) {
          out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code: 'unknownItem' });
          continue;
        }
        const fact = isFact(day.date, meal.id, item.itemId);
        // Caffeine from the composition and the portion, never from the stored numbers.
        const mg = (food.item.perPortion.caffeineMg ?? 0) * item.portion.factor;
        mealCaffeine += mg;
        caffeine += mg;
        if (mg > 0 && !fact) {
          mealCaffeineAdded = true;
          caffeineAdded = true;
        }
        if (food.categories.has('herbalTea')) {
          herbal += 1;
          if (!fact) herbalAdded = true;
        }
        if (fact) continue;
        const verdict = checkFood(food, ctx.profile.safety);
        if (!verdict.ok) {
          for (const code of verdict.reasons)
            out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code });
        } else if (verdict.servedWithout.some((a) => !(item.servedWithout ?? []).includes(a)))
          out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code: 'servedWithout' });
        if (dietBroken(food, ctx.profile.safety.diet))
          out.push({
            date: day.date,
            meal: meal.id,
            itemId: item.itemId,
            code: 'dietByIngredients',
          });
        if (!allowedAt(ctx, index, day.date, m))
          out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code: 'ruleExclusion' });
      }
      // R17 E11: the single dose is a meal's caffeine (tiramisu with a cappuccino), not one item's.
      if (mealCaffeineAdded && mealCaffeine > targets.caffeineSingleMaxMg + 1e-6)
        out.push({ date: day.date, meal: meal.id, code: 'caffeineSingle' });
    }
    // The targets' cap, and a «no more caffeine than…» rule of the person or Kiki (M3).
    const ruleCap = ctx.rules.limits
      .filter(
        (l) =>
          l.q === Q.caffeine &&
          l.per === 'day' &&
          l.max !== undefined &&
          MEAL_KINDS.some((k) => l.appliesTo(day.date, k)),
      )
      .reduce((cap, l) => Math.min(cap, l.max ?? cap), targets.caffeineMaxMg);
    if (caffeineAdded && caffeine > ruleCap + 1e-6)
      out.push({ date: day.date, meal: '', code: 'caffeineDay' });
    if (herbalAdded && herbal > herbalMax)
      out.push({ date: day.date, meal: '', code: 'herbalTeaDay' });
  }
  return out;
}

const value = (v: NutrientVector, key: keyof NutrientVector) => v[key] ?? 0;
/** Unknown is not zero (ADR 0015): a day total without data raises no flag. */
const known = (v: NutrientVector, key: keyof NutrientVector) => v[key] !== null;

/** Honest notes on a finished day (texts: `menu.ru.ts`). `previous` — the days before it, for repeats. */
export function dayFlags(ctx: PlanContext, day: DayPlan, previous: readonly DayPlan[]): DayFlag[] {
  const t = ctx.profile.targets;
  const margin = rule('S.flagMarginShare');
  const flags: DayFlag[] = [];
  const add = (flag: DayFlag) => {
    if (!flags.some((f) => f.code === flag.code && f.meal === flag.meal)) flags.push(flag);
  };
  const totals = day.totals;
  const energy = value(totals, 'energyKcal');
  const dE = (energy - t.energyKcal) / t.energyKcal;
  if (Math.abs(dE) > rule('S.energyToleranceRelaxedShare'))
    add({ code: dE < 0 ? 'energyLow' : 'energyHigh' });
  else if (Math.abs(dE) > rule('S.energyToleranceShare')) add({ code: 'energyToleranceRelaxed' });
  if (known(totals, 'proteinG') && value(totals, 'proteinG') < t.proteinG.min * (1 - margin))
    add({ code: 'proteinLow', nutrient: 'proteinG' });
  const fibre = value(totals, 'fibreG');
  if (
    known(totals, 'fibreG') &&
    (fibre < Math.min(t.fibreG.min, rule('E2.fibreFloorG')) * (1 - margin) ||
      fibre < t.fibreG.min * (1 - 2 * margin))
  )
    add({ code: 'fibreLow', nutrient: 'fibreG' });
  // Sodium is held on the week's average (D-084): a day is flagged only well above the limit.
  if (
    known(totals, 'sodiumMg') &&
    value(totals, 'sodiumMg') > t.sodiumMaxMg * (1 + rule('S.sodiumDayFlagShare'))
  )
    add({ code: 'sodiumHigh', nutrient: 'sodiumMg' });
  if (
    t.freeSugarsMaxG > 0 &&
    known(totals, 'freeSugarsG') &&
    value(totals, 'freeSugarsG') > t.freeSugarsMaxG * (1 + margin)
  )
    add({ code: 'freeSugarsHigh', nutrient: 'freeSugarsG' });
  if (known(totals, 'satFatG') && value(totals, 'satFatG') > t.satFatMaxG * (1 + margin))
    add({ code: 'satFatHigh', nutrient: 'satFatG' });
  if (value(totals, 'fatG') > t.fatG.max * (1 + margin)) add({ code: 'fatHigh', nutrient: 'fatG' });
  if (value(totals, 'carbsG') < t.carbsG.min * (1 - margin))
    add({ code: 'carbsLow', nutrient: 'carbsG' });
  if (value(totals, 'carbsG') > t.carbsG.max * (1 + margin))
    add({ code: 'carbsHigh', nutrient: 'carbsG' });

  let vegFruit = 0;
  ctx.structure.forEach((meal, m) => {
    const items = day.meals[meal.id] ?? [];
    let mealEnergy = 0;
    let mealProtein = 0;
    for (const item of items) {
      mealEnergy += value(item.nutrients, 'energyKcal');
      mealProtein += value(item.nutrients, 'proteinG');
      const index = ctx.indexOf.get(item.itemId);
      const food = index !== undefined ? ctx.foods[index] : undefined;
      if (food) vegFruit += food.groups.vegFruitG * item.portion.factor;
      if (
        food &&
        day.date &&
        isWeekdayDate(day.date) &&
        food.item.cookMin > rule('P.weekdayCookFlagMin') &&
        meal.kind !== 'snack'
      )
        add({ code: 'cookTimeRelaxed', meal: meal.id });
    }
    const share = mealEnergy / t.energyKcal;
    if (Math.abs(share - (ctx.shares[m] ?? 0)) > rule('E17.shareTolerance') + margin)
      add({ code: 'mealShareOff', meal: meal.id });
    if (
      ctx.mainMeal[m] &&
      t.mealProteinMinG > 0 &&
      share >= 0.2 &&
      mealProtein < t.mealProteinMinG * (1 - 4 * margin)
    )
      add({ code: 'mealProteinLow', meal: meal.id, nutrient: 'proteinG' });
    if (items.length === 0 || ctx.relaxedCore.has(meal.kind))
      add({ code: 'fewCandidates', meal: meal.id });
  });
  if (t.vegFruitMinG > 0 && vegFruit < t.vegFruitMinG * (1 - 4 * margin))
    add({ code: 'vegFruitLow' });

  // A main dish or soup again within R17 E19's week in the same meal means the window had to be relaxed; sides,
  // salads, fruit and dairy have short practice windows that are preferences, not promises.
  for (const meal of ctx.structure) {
    for (const item of day.meals[meal.id] ?? []) {
      if (item.role !== 'main' && item.role !== 'soup') continue;
      const window = repeatWindow(item.role);
      if (window <= 0) continue;
      const repeated = previous.some(
        (p) =>
          daysBetween(p.date, day.date) < window &&
          (p.meals[meal.id] ?? []).some((x: PlannedItem) => x.itemId === item.itemId),
      );
      if (repeated) add({ code: 'repeatRelaxed', meal: meal.id });
    }
  }
  return flags;
}

const isWeekdayDate = (date: IsoDate): boolean => {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
};
