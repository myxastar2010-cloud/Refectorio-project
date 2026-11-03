import { describe, expect, it } from 'vitest';
import { createRandom } from '@refectorio/taste-core';
import { buildContext, type PlanContext } from './context';
import { generate } from './generate';
import { repeatWindow, stateFromHistory, varietyCost, type DayState } from './planner';
import { buildMenuProfile } from './profile';
import { rule } from './rules';
import { randomAnswers, testFoods } from './testing';

const REPEAT_ROLES = new Set(['main', 'soup', 'salad', 'side', 'snack', 'dessert']);
const COMPONENT_ROLES = new Set(['fruit', 'dairy']);

/** The plain version the typed-array `varietyCost` replaced (strings and maps): the two must agree. */
function referenceVarietyCost(ctx: PlanContext, days: readonly DayState[]): number {
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

function cases(): { ctx: PlanContext; days: DayState[] }[] {
  const foods = testFoods();
  const out: { ctx: PlanContext; days: DayState[] }[] = [];
  for (const seed of [3, 8, 21, 34, 55, 89]) {
    const profile = buildMenuProfile(randomAnswers(seed), { foods });
    if (!profile.ok) continue;
    const result = generate({
      profile: profile.value,
      foods,
      today: '2026-11-04',
      seed,
      iterationsPerDay: 20,
    });
    if (!result.ok) continue;
    const plan = result.value.plan;
    const ctx = buildContext(profile.value, foods, plan.structure, plan.rules);
    out.push({ ctx, days: stateFromHistory(ctx, plan.days) });
  }
  return out;
}

describe('varietyCost', () => {
  const all = cases();

  it('equals the plain reference on generated plans', () => {
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const { ctx, days } of all)
      expect(varietyCost(ctx, days)).toBeCloseTo(referenceVarietyCost(ctx, days), 9);
  });

  it('equals the reference after random edits: repeats, swaps, foods from any pool', () => {
    for (const { ctx, days } of all) {
      const rng = createRandom(7);
      for (let k = 0; k < 60; k += 1) {
        const a = days[rng.int(days.length)];
        const b = days[rng.int(days.length)];
        const m = rng.int(ctx.structure.length);
        if (!a || !b) continue;
        const roll = rng.next();
        if (roll < 0.4) {
          // The same meal on two days: repeats within the window.
          b.meals[m] = (a.meals[m] ?? []).map((s) => ({ ...s }));
        } else if (roll < 0.7) {
          const slot = a.meals[m]?.[0];
          if (slot) slot.food = rng.int(ctx.foods.length);
        } else {
          const x = a.meals[m];
          a.meals[m] = b.meals[m] ?? [];
          b.meals[m] = x ?? [];
        }
        expect(varietyCost(ctx, days)).toBeCloseTo(referenceVarietyCost(ctx, days), 9);
      }
    }
  });
});
