/**
 * Planner state → plan JSON: planned items with portions, grams, nutrients and reasons; day totals (a nutrient is
 * known for the day when items with a value make ≥ 97 % of its weight — the food-data rule, ADR 0015); weekly notes.
 */
import { NUTRIENT_KEYS, type NutrientKey, type NutrientVector } from '@refectorio/food-data';
import type { PlanContext } from './context';
import { reasonsFor } from './explain';
import { scaleNutrients } from './foods';
import { type DayState } from './planner';
import { rule } from './rules';
import { MEAL_SLOTS } from './templates';
import type { DayPlan, PlanNote, PlannedItem } from './types';
import { dayFlags } from './validate';

const KNOWN_SHARE = 0.97;

export function dayTotals(items: readonly PlannedItem[]): NutrientVector {
  const out = {} as Record<NutrientKey, number | null>;
  const grams = items.reduce((s, i) => s + i.grams, 0);
  for (const key of NUTRIENT_KEYS) {
    let sum = 0;
    let known = 0;
    for (const item of items) {
      const v = item.nutrients[key];
      if (v === null) continue;
      sum += v;
      known += item.grams;
    }
    out[key] = grams === 0 ? 0 : known / grams >= KNOWN_SHARE ? sum : null;
  }
  return out;
}

export function plannedItems(ctx: PlanContext, day: DayState, mealIndex: number): PlannedItem[] {
  const meal = ctx.structure[mealIndex];
  if (!meal) return [];
  const order = new Map(MEAL_SLOTS[meal.kind].map((s) => [s.slot, s.display]));
  const slots = [...(day.meals[mealIndex] ?? [])].sort(
    (a, b) => (order.get(a.kind) ?? 9) - (order.get(b.kind) ?? 9) || a.food - b.food,
  );
  return slots.flatMap((slot): PlannedItem[] => {
    const food = ctx.foods[slot.food];
    const factor = ctx.grids[slot.food]?.[slot.fi] ?? 1;
    const portion = ctx.portions[slot.food]?.find((p) => p.factor === factor);
    if (!food || !portion) return [];
    const verdict = ctx.verdicts[slot.food];
    const servedWithout = verdict?.ok === true ? verdict.servedWithout : [];
    return [
      {
        itemId: food.id,
        role: food.role,
        slot: slot.kind,
        portion,
        grams: food.item.portion.grams * factor,
        nutrients: scaleNutrients(food.item.perPortion, factor),
        reasons: reasonsFor(ctx, day, mealIndex, slot),
        ...(slot.pinnedBy !== null ? { pinnedBy: slot.pinnedBy } : {}),
        ...(servedWithout.length > 0 ? { servedWithout } : {}),
      },
    ];
  });
}

export function toDayPlan(ctx: PlanContext, day: DayState, previous: readonly DayPlan[]): DayPlan {
  const meals: Record<string, PlannedItem[]> = {};
  ctx.structure.forEach((meal, m) => {
    meals[meal.id] = plannedItems(ctx, day, m);
  });
  const all = Object.values(meals).flat();
  const draft: DayPlan = { date: day.date, meals, totals: dayTotals(all), flags: [] };
  return { ...draft, flags: dayFlags(ctx, draft, previous) };
}

/** Plan-level notes: weekly quotas the planner could not meet, profile adjustments, unmatched text. */
export function planNotes(ctx: PlanContext, days: readonly DayState[]): PlanNote[] {
  const notes: PlanNote[] = [];
  const p = ctx.profile;
  if (p.macroProfileAdjusted) notes.push({ code: 'macroProfileAdjusted' });
  for (const text of p.unmatchedText) notes.push({ code: 'dislikesUnmatched', text });
  if (p.safety.diet === 'vegan') notes.push({ code: 'veganB12' });
  if ((ctx.pools.breakfast.core?.length ?? 0) < rule('E19.repeatWindowDays'))
    notes.push({ code: 'fewBreakfasts' });
  const weeks = new Map<string, DayState[]>();
  for (const d of days) {
    const list = weeks.get(d.week) ?? [];
    list.push(d);
    weeks.set(d.week, list);
  }
  for (const [week, list] of weeks) {
    if (list.length < 4) continue;
    const share = list.length / 7;
    const sum = (key: 'fishG' | 'redMeatRawG' | 'freeSugars' | 'satFat' | 'energy' | 'sodium') =>
      list.reduce((s, d) => s + (d.agg?.[key] ?? 0), 0);
    if (ctx.fishAllowed && sum('fishG') < rule('E10.fishTargetGWeek') * share * 0.5)
      notes.push({ code: 'fishWeekLow', week });
    if (
      sum('redMeatRawG') * rule('E22.redMeatCookedPerRawG') >
      rule('E22.redMeatMaxCookedGWeek') * share * 1.05
    )
      notes.push({ code: 'redMeatWeekHigh', week });
    const energy = sum('energy');
    if (energy > 0 && (sum('freeSugars') * 4) / energy > rule('E3.freeSugarsMaxShare') * 1.05)
      notes.push({ code: 'freeSugarsWeekHigh', week });
    if (energy > 0 && (sum('satFat') * 9) / energy > rule('E5.satFatMaxShare') * 1.05)
      notes.push({ code: 'satFatWeekHigh', week });
    const limit = ctx.profile.targets.sodiumMaxMg;
    if (limit > 0 && sum('sodium') / list.length > limit * 1.05)
      notes.push({ code: 'sodiumWeekHigh', week });
  }
  return notes;
}
