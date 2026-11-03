/**
 * The validator (ТЗ фаза 3 §3.4, algorithm-spec §6): re-checks every hard rule from the composition of the finished
 * plan — never trusting the planner's pools — and turns soft misses into honest day flags. A hard violation is a bug:
 * the property tests require zero.
 */
import type { NutrientVector } from '@refectorio/food-data';
import { allowedAt, type PlanContext } from './context';
import { checkFood, type HardReason } from './filter';
import { repeatWindow } from './planner';
import { rule } from './rules';
import { MAX_ITEMS_PER_MEAL } from './templates';
import type { DayFlag, DayPlan, IsoDate, PlannedItem } from './types';
import { daysBetween } from './dates';

export type HardViolation = {
  readonly date: IsoDate;
  readonly meal: string;
  readonly itemId?: string;
  readonly code:
    | HardReason
    | 'unknownItem'
    | 'ruleExclusion'
    | 'caffeineDay'
    | 'caffeineSingle'
    | 'tooManyItems';
};

export function hardViolations(ctx: PlanContext, days: readonly DayPlan[]): HardViolation[] {
  const out: HardViolation[] = [];
  const targets = ctx.profile.targets;
  for (const day of days) {
    let caffeine = 0;
    ctx.structure.forEach((meal, m) => {
      const items = day.meals[meal.id] ?? [];
      if (items.length > MAX_ITEMS_PER_MEAL)
        out.push({ date: day.date, meal: meal.id, code: 'tooManyItems' });
      for (const item of items) {
        const index = ctx.indexOf.get(item.itemId);
        const food = index !== undefined ? ctx.foods[index] : undefined;
        if (index === undefined || !food) {
          out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code: 'unknownItem' });
          continue;
        }
        const verdict = checkFood(food, ctx.profile.safety);
        if (!verdict.ok) {
          for (const code of verdict.reasons)
            out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code });
        }
        if (!allowedAt(ctx, index, day.date, m))
          out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code: 'ruleExclusion' });
        const mg = item.nutrients.caffeineMg ?? 0;
        caffeine += mg;
        if (mg > targets.caffeineSingleMaxMg + 1e-6)
          out.push({ date: day.date, meal: meal.id, itemId: item.itemId, code: 'caffeineSingle' });
      }
    });
    if (caffeine > targets.caffeineMaxMg + 1e-6)
      out.push({ date: day.date, meal: '', code: 'caffeineDay' });
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
  if (known(totals, 'sodiumMg') && value(totals, 'sodiumMg') > t.sodiumMaxMg * (1 + margin))
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
    if (items.length === 0) add({ code: 'fewCandidates', meal: meal.id });
  });
  if (t.vegFruitMinG > 0 && vegFruit < t.vegFruitMinG * (1 - 4 * margin))
    add({ code: 'vegFruitLow' });

  // Repeats within the strict windows (R17 E19) mean the window had to be relaxed.
  for (const meal of ctx.structure) {
    for (const item of day.meals[meal.id] ?? []) {
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
