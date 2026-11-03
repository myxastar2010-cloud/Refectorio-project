import { describe, expect, it } from 'vitest';
import { BASE_WEIGHTS, Q, QN, solveDay, type DayItem, type DayProblem } from './portions';
import type { DayTargets } from './types';

const GRID = [0.5, 0.75, 1, 1.25, 1.5];

const TARGETS: DayTargets = {
  energyKcal: 2000,
  proteinG: { min: 60, target: 90, max: 175 },
  fatG: { min: 44, target: 67, max: 78 },
  carbsG: { min: 225, target: 260, max: 300 },
  fibreG: { min: 25, target: 28 },
  freeSugarsMaxG: 50,
  freeSugarsGoalG: 25,
  satFatMaxG: 22,
  sodiumMaxMg: 2000,
  potassiumMinMg: 3510,
  vegFruitMinG: 400,
  waterTotalMl: 2000,
  glassMl: 250,
  caffeineMaxMg: 200,
  caffeineSingleMaxMg: 150,
  mealProteinMinG: 15,
  micros: {},
};

/** A tracked vector: energy and macros in the usual proportions, plus caffeine and one extra column (a budget). */
function item(
  energy: number,
  meal: number,
  extra: { caffeine?: number; budget?: number; fixedAt?: number } = {},
): DayItem {
  const q = new Float64Array(QN + 1);
  q[Q.energy] = energy;
  q[Q.protein] = (energy * 0.18) / 4;
  q[Q.fat] = (energy * 0.3) / 9;
  q[Q.carbs] = (energy * 0.52) / 4;
  q[Q.fibre] = energy / 80;
  q[Q.vegFruit] = energy / 5;
  q[Q.caffeine] = extra.caffeine ?? 0;
  q[QN] = extra.budget ?? 0;
  return {
    q,
    grid: GRID,
    fixed: extra.fixedAt !== undefined,
    ...(extra.fixedAt !== undefined ? { fixedAt: extra.fixedAt } : {}),
    meal,
  };
}

function problem(items: DayItem[], caps: DayProblem['caps'] = []): DayProblem {
  return {
    items,
    mealShare: [0.25, 0.4, 0.35],
    mainMeal: [true, true, true],
    targets: TARGETS,
    weights: BASE_WEIGHTS,
    limits: [],
    caps,
  };
}

const total = (p: DayProblem, factors: readonly number[], q: number) =>
  p.items.reduce((sum, it, i) => sum + (it.q[q] ?? 0) * (factors[i] ?? 1), 0);

describe('solveDay (ТЗ фаза 3 §3.3)', () => {
  it('brings the day near its energy target with portions from the grid', () => {
    const p = problem([item(400, 0), item(700, 1), item(600, 2)]);
    const s = solveDay(p, undefined, true);
    for (const [i, f] of s.factors.entries()) expect(p.items[i]?.grid).toContain(f);
    expect(Math.abs(total(p, s.factors, Q.energy) / 2000 - 1)).toBeLessThanOrEqual(0.05);
  });

  it('never exceeds a hard day cap and steps an over-cap start down (the fish budget, R17 E9)', () => {
    // The fish dish alone at the standard portion would use 1.2 of a remaining room of 0.8.
    const p = problem(
      [item(300, 0), item(700, 1, { budget: 1.2 }), item(500, 2)],
      [{ q: QN, max: 0.8 }],
    );
    for (const full of [false, true]) {
      const s = solveDay(p, [2, 2, 2], full);
      expect(total(p, s.factors, QN)).toBeLessThanOrEqual(0.8 + 1e-9);
    }
  });

  it('keeps the caffeine caps: per drink and per day', () => {
    const coffee = item(10, 0, { caffeine: 120 });
    const tea = item(5, 2, { caffeine: 60 });
    const p = problem([coffee, item(600, 0), item(800, 1), tea, item(600, 2)]);
    const s = solveDay(p, [4, 2, 2, 4, 2], true);
    expect((coffee.q[Q.caffeine] ?? 0) * (s.factors[0] ?? 1)).toBeLessThanOrEqual(150 + 1e-9);
    expect(total(p, s.factors, Q.caffeine)).toBeLessThanOrEqual(200 + 1e-9);
  });

  it('never moves an eaten (fixed) portion, even when a cap is already broken', () => {
    const eaten = item(500, 0, { budget: 1, fixedAt: 4 });
    const p = problem([eaten, item(700, 1, { budget: 0.5 }), item(500, 2)], [{ q: QN, max: 1 }]);
    const s = solveDay(p, [4, 2, 2], true);
    expect(s.factors[0]).toBe(1.5);
    // The other fish dish takes its smallest portion: the room is gone, nothing else can be done.
    expect(s.factors[1]).toBe(0.5);
  });

  it('is deterministic', () => {
    const p = problem([item(350, 0), item(650, 1), item(550, 2)]);
    expect(solveDay(p, undefined, true)).toEqual(solveDay(p, undefined, true));
  });
});
