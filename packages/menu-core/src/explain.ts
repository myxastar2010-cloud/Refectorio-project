/**
 * Why an item is on the menu (ТЗ фаза 3 §3.5): reason codes from the plan's own facts — rules, safety notes, taste,
 * nutrition, context. Texts are templates in the web content (`menu.ru.ts`), without numbers; at most three reasons.
 */
import type { PlanContext } from './context';
import type { DayState, Slot } from './planner';
import { rule } from './rules';
import type { ReasonCode } from './types';

const MAX_REASONS = 3;

export function reasonsFor(
  ctx: PlanContext,
  day: DayState,
  mealIndex: number,
  slot: Slot,
): ReasonCode[] {
  const food = ctx.foods[slot.food];
  const meal = ctx.structure[mealIndex];
  if (!food || !meal) return [];
  const out: ReasonCode[] = [];
  const add = (code: ReasonCode, when: boolean) => {
    if (when && !out.includes(code)) out.push(code);
  };
  const goals = ctx.profile.extraGoals;
  const verdict = ctx.verdicts[slot.food];
  const byRule = (createdBy: 'user' | 'kiki') =>
    ctx.rules.includes.some((r) => r.ruleId === slot.pinnedBy && r.createdBy === createdBy) ||
    ctx.rules.prefer.some(
      (p) =>
        p.sign < 0 &&
        p.createdBy === createdBy &&
        p.foods.has(slot.food) &&
        p.appliesTo(day.date, meal.kind),
    );
  add('ruleByUser', byRule('user'));
  add('ruleByKiki', byRule('kiki'));
  add('servedWithout', verdict?.ok === true && verdict.servedWithout.length > 0);
  add('fixedPortion', verdict?.ok === true && verdict.fixedPortion);
  add(
    'tasteMatch',
    (ctx.pLike[slot.food] ?? 0) >= rule('X.tasteMatchMin') && food.role !== 'drink',
  );
  const highProtein = food.categories.has('highProtein');
  add('proteinForward', goals.has('fitness') && highProtein);
  add('proteinRich', highProtein);
  add('fish', food.groups.fishG > 0);
  add('legumes', food.groups.legumesG > 0);
  add('vegetables', food.groups.vegFruitG >= rule('X.vegetablesMinG'));
  add('fibreRich', (food.item.perPortion.fibreG ?? 0) >= rule('X.fibreRichMinG'));
  add('wholeGrain', food.groups.wholeGrainG >= rule('X.wholeGrainMinG'));
  add(
    'lowSalt',
    ctx.profile.safety.dishRules.has('limitSodium') &&
      (food.item.perPortion.sodiumMg ?? 0) <= rule('X.lowSaltMaxMg'),
  );
  add(
    'lightDinner',
    goals.has('sleep') &&
      meal.kind === 'dinner' &&
      slot.kind === 'core' &&
      food.features.traits.richness <= rule('X.lightDinnerRichnessMax'),
  );
  add(
    'caffeineFreeEvening',
    goals.has('sleep') &&
      food.role === 'drink' &&
      food.caffeineMg < 1 &&
      (ctx.hours[mealIndex] ?? 0) >= 15,
  );
  add(
    'steadyEnergy',
    goals.has('energy') &&
      slot.kind === 'core' &&
      (food.item.perPortion.fibreG ?? 0) >= rule('X.fibreRichMinG') / 2,
  );
  add(
    'lunchBox',
    day.weekday && meal.kind === 'lunch' && food.role !== 'drink' && food.item.flags.has('boxable'),
  );
  add(
    'quick',
    day.weekday &&
      food.item.cookMin <= rule('P.quickMaxMin') &&
      food.item.cookMin > 0 &&
      slot.kind === 'core',
  );
  add('weekendCooking', !day.weekday && food.item.cookMin > rule('P.weekdayCookMaxMin'));
  if (out.length === 0) out.push(slot.kind === 'core' ? 'variety' : 'balance');
  return out.slice(0, MAX_REASONS);
}
