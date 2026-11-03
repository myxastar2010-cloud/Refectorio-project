/**
 * Property tests (ТЗ фаза 3 §10) over random valid people × tastes × structures: zero hard violations, energy within
 * tolerance or flagged, determinism by seed, repeats only when flagged. CI runs MENU_PROPERTY_RUNS (default 150) with
 * a short search; the full 5 000-person run is `npm run menu:sim -- --personas 5000` (reports/stage-4/menu-sim.md).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildContext } from './context';
import { daysBetween } from './dates';
import { generate } from './generate';
import { buildMenuProfile } from './profile';
import { rule } from './rules';
import { structureFromKinds } from './structure';
import { randomAnswers, testFoods } from './testing';
import type { MealKind } from './types';
import { hardViolations } from './validate';

const foods = testFoods();
const RUNS = Number(process.env.MENU_PROPERTY_RUNS ?? 150);
const STRUCTURES: readonly (readonly MealKind[])[] = [
  ['breakfast', 'lunch', 'snack', 'dinner'],
  ['breakfast', 'lunch', 'dinner'],
  ['breakfast', 'snack', 'lunch', 'snack', 'dinner'],
  ['lunch', 'dinner'],
  ['breakfast', 'lunch', 'snack', 'dinner', 'snack'],
];

// One plan takes ≈ 60 ms with the short search: the runs need more than Vitest's default 5 s.
const TIMEOUT_MS = 10 * 60_000;

describe('menu properties over random people', () => {
  it(
    'never breaks a hard rule; energy is within tolerance or the day says so; repeats are flagged',
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 2_000_000_000 }),
          fc.integer({ min: 0, max: STRUCTURES.length - 1 }),
          (seed, s) => {
            const profile = buildMenuProfile(randomAnswers(seed), { foods });
            if (!profile.ok) return; // refused, family mode… — the quiz shows its own screen.
            const kinds = STRUCTURES[s] ?? [];
            const mains = kinds.filter((k) => k !== 'snack').length;
            const result = generate({
              profile: profile.value,
              foods,
              today: '2026-11-02',
              seed,
              structure: structureFromKinds(kinds),
              iterationsPerDay: 25,
            });
            if (!result.ok) {
              // The only allowed refusal: a structure under the person's minimum of main meals (R17 E16).
              expect(result.error.code).toBe('structure');
              expect(mains).toBeLessThan(profile.value.safety.minMainMeals);
              return;
            }
            const plan = result.value.plan;
            const ctx = buildContext(profile.value, foods, plan.structure, []);
            expect(hardViolations(ctx, plan.days)).toEqual([]);
            plan.days.forEach((day, d) => {
              const dev = (day.totals.energyKcal ?? 0) / plan.targets.energyKcal - 1;
              if (Math.abs(dev) > rule('S.energyToleranceRelaxedShare'))
                expect(day.flags.map((f) => f.code)).toContain(
                  dev < 0 ? 'energyLow' : 'energyHigh',
                );
              for (const [mealId, items] of Object.entries(day.meals)) {
                for (const item of items.filter((i) => i.role === 'main' || i.role === 'soup')) {
                  const repeated = plan.days
                    .slice(0, d)
                    .some(
                      (p) =>
                        daysBetween(p.date, day.date) < rule('E19.repeatWindowDays') &&
                        (p.meals[mealId] ?? []).some((x) => x.itemId === item.itemId),
                    );
                  if (repeated) expect(day.flags.map((f) => f.code)).toContain('repeatRelaxed');
                }
              }
            });
          },
        ),
        { numRuns: RUNS, seed: 20261103 },
      );
    },
    TIMEOUT_MS,
  );

  it(
    'gives the same plan for the same inputs and seed',
    () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 2_000_000_000 }), (seed) => {
          const profile = buildMenuProfile(randomAnswers(seed), { foods });
          if (!profile.ok) return;
          const run = () =>
            JSON.stringify(
              generate({
                profile: profile.value,
                foods,
                today: '2026-11-05',
                seed,
                iterationsPerDay: 15,
              }),
            );
          expect(run()).toBe(run());
        }),
        { numRuns: Math.max(10, Math.round(RUNS / 10)), seed: 7 },
      );
    },
    TIMEOUT_MS,
  );
});
