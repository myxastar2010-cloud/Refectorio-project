/**
 * The portion solver of one day (ТЗ фаза 3 §3.3): discrete portions that bring the day to its targets — energy
 * within ±5 % (heavily weighted), protein at least the target (and a per-meal floor), fat and carbohydrates in their
 * corridors, fibre, sodium, free sugars, saturated fat, vegetables and fruit, meal shares (R17 E17), portions near the
 * standard one. Method: continuous bounded least squares on the multipliers → rounding to the grid → neighbourhood
 * search (±1–2 steps per item, then pairs). Pure arithmetic (+ − × ÷), so results are identical on every JS engine.
 * HiGHS (WASM) was rejected for the browser: ≈ 1 MB for a problem this small (ADR 0014).
 */
import type { NutrientKey } from '@refectorio/food-data';
import type { MenuFood } from './foods';
import { rule } from './rules';
import type { DayTargets } from './types';

/** Quantities the solver tracks per item at its standard portion. */
export const Q = {
  energy: 0,
  protein: 1,
  fat: 2,
  carbs: 3,
  fibre: 4,
  sodium: 5,
  freeSugars: 6,
  satFat: 7,
  potassium: 8,
  vegFruit: 9,
  caffeine: 10,
} as const;
export const QN = 11;

export const Q_NUTRIENT: readonly (NutrientKey | null)[] = [
  'energyKcal',
  'proteinG',
  'fatG',
  'carbsG',
  'fibreG',
  'sodiumMg',
  'freeSugarsG',
  'satFatG',
  'potassiumMg',
  null,
  'caffeineMg',
];

/** The tracked vector at the standard portion; `extra` nutrients (named by DSL limits) follow the QN base ones. */
export function trackedVector(food: MenuFood, extra: readonly NutrientKey[] = []): Float64Array {
  const v = new Float64Array(QN + extra.length);
  Q_NUTRIENT.forEach((key, i) => {
    v[i] = key ? (food.item.perPortion[key] ?? 0) : 0;
  });
  v[Q.vegFruit] = food.groups.vegFruitG;
  extra.forEach((key, i) => {
    v[QN + i] = food.item.perPortion[key] ?? 0;
  });
  return v;
}

export type Weights = {
  readonly energy: number;
  readonly energyBand: number;
  readonly share: number;
  readonly shareSoft: number;
  readonly protein: number;
  readonly proteinMax: number;
  readonly fatBand: number;
  readonly fatTarget: number;
  readonly carbBand: number;
  readonly carbTarget: number;
  readonly fibre: number;
  readonly fibreTarget: number;
  readonly sodium: number;
  readonly sugar: number;
  readonly sugarGoal: number;
  readonly satFat: number;
  readonly potassium: number;
  readonly vegFruit: number;
  readonly mealProtein: number;
  readonly portion: number;
  readonly nutrientRule: number;
};

/**
 * Tuned on the simulation (reports/stage-4/menu-sim.md): a 5 % energy miss costs ≈ 0.75, a 10 % one ≈ 10; 5 % over the
 * sodium limit ≈ 1.2, 20 % ≈ 7.
 */
export const BASE_WEIGHTS: Weights = {
  energy: 300,
  energyBand: 3000,
  share: 30,
  shareSoft: 2,
  protein: 30,
  proteinMax: 10,
  fatBand: 15,
  fatTarget: 4,
  carbBand: 15,
  carbTarget: 3,
  fibre: 8,
  fibreTarget: 2,
  sodium: 20,
  sugar: 20,
  sugarGoal: 2,
  satFat: 20,
  potassium: 1,
  vegFruit: 4,
  mealProtein: 2,
  portion: 0.6,
  nutrientRule: 100,
};

/** A DSL limit on a tracked quantity (rules minNutrient / maxNutrient), per day (`meal` −1) or per meal. */
export type NutrientLimit = {
  readonly q: number;
  readonly meal: number;
  readonly min?: number;
  readonly max?: number;
};

export type DayItem = {
  /** Tracked quantities at the standard portion. */
  readonly q: Float64Array;
  /** Allowed factors, ascending. */
  readonly grid: readonly number[];
  readonly fixed: boolean;
  /** For a fixed item: its grid index (an eaten portion stays as it was); absent — the standard portion. */
  readonly fixedAt?: number;
  readonly meal: number;
};

export type DayProblem = {
  readonly items: readonly DayItem[];
  readonly mealShare: readonly number[];
  readonly mainMeal: readonly boolean[];
  readonly targets: DayTargets;
  readonly weights: Weights;
  readonly limits: readonly NutrientLimit[];
};

export type DaySolution = {
  /** Index into each item's grid. */
  readonly factorIndex: readonly number[];
  readonly factors: readonly number[];
  readonly cost: number;
  readonly totals: Float64Array;
  readonly mealEnergy: readonly number[];
};

const sq = (x: number) => x * x;
/** Typed-array read; indices are always in range here, the fallback only satisfies the type checker. */
const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;
const under = (value: number, min: number) => (min > 0 && value < min ? (min - value) / min : 0);
const over = (value: number, max: number) => (max > 0 && value > max ? (value - max) / max : 0);
/** A limit's penalty: linear from the first gram (a small excess still counts), quadratic for big ones. */
const pen = (x: number) => x + 4 * x * x;

type Work = {
  /** Tracked quantities per item: QN, plus the nutrients the person's DSL limits name. */
  readonly width: number;
  readonly totals: Float64Array;
  readonly mealEnergy: Float64Array;
  readonly mealProtein: Float64Array;
  /** Per-meal totals for the DSL limits: [meal * width + q]. */
  readonly mealQ: Float64Array;
  reg: number;
};

function nutritionCost(p: DayProblem, w: Work): number {
  const t = p.targets;
  const W = p.weights;
  const T = w.totals;
  const eT = t.energyKcal;
  const dE = (at(T, Q.energy) - eT) / eT;
  let c =
    W.energy * dE * dE +
    W.energyBand * sq(Math.max(0, Math.abs(dE) - rule('S.energyToleranceShare')));
  const shareTol = rule('E17.shareTolerance');
  for (let m = 0; m < p.mealShare.length; m += 1) {
    const s = at(w.mealEnergy, m) / eT;
    const d = s - (p.mealShare[m] ?? 0);
    c += W.share * sq(Math.max(0, Math.abs(d) - shareTol)) + W.shareSoft * d * d;
    if (p.mainMeal[m] === true && t.mealProteinMinG > 0 && s >= 0.2)
      c += W.mealProtein * pen(under(at(w.mealProtein, m), t.mealProteinMinG));
  }
  const protein = at(T, Q.protein);
  const fat = at(T, Q.fat);
  const carbs = at(T, Q.carbs);
  const fibre = at(T, Q.fibre);
  const sugar = at(T, Q.freeSugars);
  c +=
    W.protein * pen(under(protein, t.proteinG.min)) +
    W.proteinMax * pen(over(protein, t.proteinG.max));
  c += W.fatBand * (pen(under(fat, t.fatG.min)) + pen(over(fat, t.fatG.max)));
  c += W.fatTarget * sq((fat - t.fatG.target) / Math.max(t.fatG.target, 1));
  c += W.carbBand * (pen(under(carbs, t.carbsG.min)) + pen(over(carbs, t.carbsG.max)));
  c += W.carbTarget * sq((carbs - t.carbsG.target) / Math.max(t.carbsG.target, 1));
  c +=
    W.fibre * pen(under(fibre, t.fibreG.min)) + W.fibreTarget * sq(under(fibre, t.fibreG.target));
  c += W.sodium * pen(over(at(T, Q.sodium), t.sodiumMaxMg));
  c +=
    t.freeSugarsMaxG > 0
      ? W.sugar * pen(over(sugar, t.freeSugarsMaxG)) +
        W.sugarGoal * sq(over(sugar, t.freeSugarsGoalG))
      : W.sugar * pen(sugar / 10);
  c += W.satFat * pen(over(at(T, Q.satFat), t.satFatMaxG));
  c += W.potassium * pen(under(at(T, Q.potassium), t.potassiumMinMg));
  c += W.vegFruit * pen(under(at(T, Q.vegFruit), t.vegFruitMinG));
  for (const limit of p.limits) {
    const value = limit.meal < 0 ? at(T, limit.q) : at(w.mealQ, limit.meal * w.width + limit.q);
    if (limit.min !== undefined) c += W.nutrientRule * pen(under(value, limit.min));
    if (limit.max !== undefined) c += W.nutrientRule * pen(over(value, limit.max));
  }
  return c + W.portion * w.reg;
}

/** Caffeine caps (R17 E11–E13) are hard: a portion that breaks them is never taken. */
function caffeineOk(p: DayProblem, w: Work, item: DayItem, factor: number): boolean {
  if (at(item.q, Q.caffeine) * factor > p.targets.caffeineSingleMaxMg + 1e-9) return false;
  return at(w.totals, Q.caffeine) <= p.targets.caffeineMaxMg + 1e-9;
}

function add(w: Work, item: DayItem, d: number): void {
  for (let k = 0; k < w.width; k += 1) {
    const v = d * at(item.q, k);
    w.totals[k] = at(w.totals, k) + v;
    const mk = item.meal * w.width + k;
    w.mealQ[mk] = at(w.mealQ, mk) + v;
  }
  w.mealEnergy[item.meal] = at(w.mealEnergy, item.meal) + d * at(item.q, Q.energy);
  w.mealProtein[item.meal] = at(w.mealProtein, item.meal) + d * at(item.q, Q.protein);
}

function change(w: Work, item: DayItem, from: number, to: number): void {
  if (from === to) return;
  add(w, item, to - from);
  w.reg += sq(to - 1) - sq(from - 1);
}

function makeWork(p: DayProblem, factors: readonly number[]): Work {
  const meals = p.mealShare.length;
  const width = p.items[0]?.q.length ?? QN;
  const w: Work = {
    width,
    totals: new Float64Array(width),
    mealEnergy: new Float64Array(meals),
    mealProtein: new Float64Array(meals),
    mealQ: new Float64Array(meals * width),
    reg: 0,
  };
  p.items.forEach((item, i) => {
    const f = factors[i] ?? 1;
    add(w, item, f);
    w.reg += sq(f - 1);
  });
  return w;
}

function nearestIndex(grid: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < grid.length; i += 1) {
    if (Math.abs((grid[i] ?? 0) - value) < Math.abs((grid[best] ?? 0) - value) - 1e-12) best = i;
  }
  return best;
}

const standardIndex = (item: DayItem): number => {
  if (item.fixedAt !== undefined) return item.fixedAt;
  const i = item.grid.indexOf(1);
  return i >= 0 ? i : nearestIndex(item.grid, 1);
};

/**
 * Continuous relaxation: weighted least squares on energy, protein, fat, carbohydrates and meal shares with a pull
 * to the standard portion, solved by projected coordinate descent (a closed form per item).
 */
function continuousStart(p: DayProblem): number[] {
  const t = p.targets;
  const goals = [
    { q: Q.energy, target: t.energyKcal, w: p.weights.energy },
    { q: Q.protein, target: t.proteinG.target, w: p.weights.protein * 0.1 },
    { q: Q.fat, target: t.fatG.target, w: p.weights.fatTarget },
    { q: Q.carbs, target: t.carbsG.target, w: p.weights.carbTarget },
  ].filter((g) => g.target > 0);
  const n = p.items.length;
  const f = new Array<number>(n).fill(1);
  const totals = goals.map((g) => p.items.reduce((s, it) => s + at(it.q, g.q), 0));
  const meal = p.mealShare.map((_, m) =>
    p.items.reduce((s, it) => (it.meal === m ? s + at(it.q, Q.energy) : s), 0),
  );
  const lambda = p.weights.portion;
  const shareW = p.weights.shareSoft + p.weights.share * 0.1;
  for (let pass = 0; pass < 20; pass += 1) {
    p.items.forEach((item, i) => {
      if (item.fixed || item.grid.length < 2) return;
      const fi = f[i] ?? 1;
      let num = lambda;
      let den = lambda;
      goals.forEach((g, k) => {
        const a = at(item.q, g.q) / g.target;
        const rest = ((totals[k] ?? 0) - fi * at(item.q, g.q)) / g.target - 1;
        num -= g.w * a * rest;
        den += g.w * a * a;
      });
      const a = at(item.q, Q.energy) / t.energyKcal;
      const restMeal =
        ((meal[item.meal] ?? 0) - fi * at(item.q, Q.energy)) / t.energyKcal -
        (p.mealShare[item.meal] ?? 0);
      num -= shareW * a * restMeal;
      den += shareW * a * a;
      const lo = item.grid[0] ?? 1;
      const hi = item.grid[item.grid.length - 1] ?? 1;
      const next = Math.min(hi, Math.max(lo, num / den));
      const d = next - fi;
      goals.forEach((g, k) => {
        totals[k] = (totals[k] ?? 0) + d * at(item.q, g.q);
      });
      meal[item.meal] = (meal[item.meal] ?? 0) + d * at(item.q, Q.energy);
      f[i] = next;
    });
  }
  return f;
}

/**
 * Solves one day. `start` — the previous solution's grid indices (warm start in the local search); `full` adds the
 * continuous start, whole-grid moves and pair moves (the final pass).
 */
export function solveDay(p: DayProblem, start?: readonly number[], full = false): DaySolution {
  const items = p.items;
  const idx: number[] = full
    ? continuousStart(p).map((f, i) => {
        const item = items[i];
        return !item || item.fixed ? (item ? standardIndex(item) : 0) : nearestIndex(item.grid, f);
      })
    : items.map((item, i) => {
        const s = start?.[i];
        return !item.fixed && s !== undefined && s >= 0 && s < item.grid.length
          ? s
          : standardIndex(item);
      });
  const factorOf = (i: number): number => items[i]?.grid[idx[i] ?? 0] ?? 1;
  const w = makeWork(
    p,
    idx.map((_, i) => factorOf(i)),
  );
  // A start that breaks a caffeine cap (a bigger coffee) steps down first.
  items.forEach((item, i) => {
    while (
      (idx[i] ?? 0) > 0 &&
      at(item.q, Q.caffeine) > 0 &&
      !caffeineOk(p, w, item, factorOf(i))
    ) {
      const from = factorOf(i);
      idx[i] = (idx[i] ?? 0) - 1;
      change(w, item, from, factorOf(i));
    }
  });
  let cost = nutritionCost(p, w);
  const passes = full ? 6 : 3;
  for (let pass = 0; pass < passes; pass += 1) {
    let improved = false;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || item.fixed || item.grid.length < 2) continue;
      const current = idx[i] ?? 0;
      const from = item.grid[current] ?? 1;
      let bestIdx = current;
      let bestCost = cost;
      const lo = full ? 0 : Math.max(0, current - 2);
      const hi = full ? item.grid.length - 1 : Math.min(item.grid.length - 1, current + 2);
      for (let j = lo; j <= hi; j += 1) {
        if (j === current) continue;
        const to = item.grid[j] ?? 1;
        change(w, item, from, to);
        if (caffeineOk(p, w, item, to)) {
          const c = nutritionCost(p, w);
          if (c < bestCost - 1e-12) {
            bestCost = c;
            bestIdx = j;
          }
        }
        change(w, item, to, from);
      }
      if (bestIdx !== current) {
        change(w, item, from, item.grid[bestIdx] ?? 1);
        idx[i] = bestIdx;
        cost = bestCost;
        improved = true;
      }
    }
    if (full) {
      // Pairs: one step up for one item and one down for another trade energy between them.
      for (let i = 0; i < items.length; i += 1) {
        for (let j = 0; j < items.length; j += 1) {
          const a = items[i];
          const b = items[j];
          if (!a || !b || i === j || a.fixed || b.fixed) continue;
          const ai = idx[i] ?? 0;
          const bj = idx[j] ?? 0;
          if (ai + 1 >= a.grid.length || bj - 1 < 0) continue;
          const aFrom = a.grid[ai] ?? 1;
          const aTo = a.grid[ai + 1] ?? 1;
          const bFrom = b.grid[bj] ?? 1;
          const bTo = b.grid[bj - 1] ?? 1;
          change(w, a, aFrom, aTo);
          change(w, b, bFrom, bTo);
          const c =
            caffeineOk(p, w, a, aTo) && caffeineOk(p, w, b, bTo)
              ? nutritionCost(p, w)
              : Number.POSITIVE_INFINITY;
          if (c < cost - 1e-12) {
            idx[i] = ai + 1;
            idx[j] = bj - 1;
            cost = c;
            improved = true;
          } else {
            change(w, b, bTo, bFrom);
            change(w, a, aTo, aFrom);
          }
        }
      }
    }
    if (!improved) break;
  }
  return {
    factorIndex: idx,
    factors: idx.map((_, i) => factorOf(i)),
    cost,
    totals: w.totals,
    mealEnergy: [...w.mealEnergy],
  };
}
