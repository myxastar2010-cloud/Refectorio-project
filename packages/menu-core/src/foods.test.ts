import type { FoodItem } from '@refectorio/food-data';
import { describe, expect, it } from 'vitest';
import { buildFoodIndex, portionGrid, scaleNutrients } from './foods';
import { testCatalog, testFoods } from './testing';

const foods = testFoods();
const item = (id: string): FoodItem => {
  const found = foods.byId.get(id)?.item;
  if (!found) throw new Error(`no item ${id}`);
  return found;
};
const food = (id: string) => {
  const found = foods.byId.get(id);
  if (!found) throw new Error(`no food ${id}`);
  return found;
};

describe('buildFoodIndex', () => {
  it('indexes every item by id', () => {
    expect(foods.foods.length).toBeGreaterThan(200);
    expect(foods.byId.size).toBe(foods.foods.length);
    for (const f of foods.foods) expect(foods.byId.get(f.id)).toBe(f);
    expect(foods.version.length).toBeGreaterThan(0);
  });

  it('refuses a food-core chunk that is not valid', () => {
    expect(() => buildFoodIndex({ foodCore: { nope: true }, catalog: testCatalog() })).toThrow();
  });

  it('takes names from the catalog or food text and gives every item a main protein', () => {
    for (const f of foods.foods) {
      expect(f.nameRu.length).toBeGreaterThan(0);
      expect(f.mainProtein.length).toBeGreaterThan(0);
    }
    expect(food('d_omelette').nameRu).toBe('Омлет');
  });

  it('marks only water as tracked separately', () => {
    expect(foods.foods.filter((f) => f.trackedSeparately).map((f) => f.id)).toEqual(['d_water']);
  });
});

describe('categories and group grams', () => {
  it('counts fish and oily fish for salmon', () => {
    const salmon = food('d_baked_salmon');
    expect(salmon.categories.has('fish')).toBe(true);
    expect(salmon.groups.fishG).toBeGreaterThan(0);
    expect(salmon.groups.oilyFishG).toBeGreaterThan(0);
    expect(salmon.groups.redMeatRawG).toBe(0);
  });

  it('counts raw red meat for a beef dish', () => {
    const beef = foods.foods.find((f) => f.categories.has('beef') && f.role === 'main');
    expect(beef?.groups.redMeatRawG).toBeGreaterThan(0);
  });

  it('counts dairy servings for kefir', () => {
    expect(food('d_kefir').groups.dairyServings).toBeGreaterThan(0);
  });

  it('counts legumes, whole grain, nuts, eggs and vegetables where they are', () => {
    expect(foods.foods.some((f) => f.groups.legumesG > 0)).toBe(true);
    expect(food('d_buckwheat_porridge').groups.wholeGrainG).toBeGreaterThan(0);
    expect(foods.foods.some((f) => f.groups.nutsG > 0)).toBe(true);
    expect(food('d_fried_eggs').groups.eggsG).toBeGreaterThan(0);
    expect(foods.foods.some((f) => f.groups.vegFruitG > 0)).toBe(true);
    expect(foods.foods.some((f) => f.groups.processedMeatG > 0)).toBe(true);
    expect(foods.foods.some((f) => f.groups.poultryG > 0)).toBe(true);
    expect(foods.foods.some((f) => f.groups.tunaG > 0)).toBe(true);
  });

  it('derives role, name and trait categories', () => {
    expect(food('d_chicken_noodle_soup').categories.has('soup')).toBe(true);
    expect(food('d_buckwheat_porridge').categories.has('porridge')).toBe(true);
    expect(food('d_kefir').categories.has('drink')).toBe(true);
    expect(food('d_kiwi').categories.has('fruit')).toBe(true);
    expect(food('d_fried_eggs').categories.has('fried')).toBe(true);
    expect(foods.foods.some((f) => f.categories.has('highProtein'))).toBe(true);
    expect(foods.foods.some((f) => f.categories.has('baking'))).toBe(true);
    expect(foods.foods.some((f) => f.categories.has('spicy'))).toBe(true);
    expect(foods.foods.some((f) => f.categories.has('lunchBox'))).toBe(true);
    expect(foods.foods.some((f) => f.categories.has('quick'))).toBe(true);
    expect(food('d_buckwheat_porridge').categories.has('vegetarian')).toBe(true);
  });

  it('adds ancestors of categories', () => {
    const chicken = foods.foods.find((f) => f.categories.has('chicken'));
    expect(chicken?.categories.has('poultry')).toBe(true);
    expect(chicken?.categories.has('meat')).toBe(true);
  });

  it('gives every item a non-negative caffeine amount', () => {
    for (const f of foods.foods) expect(f.caffeineMg).toBeGreaterThanOrEqual(0);
    expect(foods.foods.some((f) => f.caffeineMg > 0)).toBe(true);
  });
});

describe('needsSide', () => {
  it('is true for cutlets and false for plov, pasta and breakfast dishes', () => {
    expect(food('d_kotlety').needsSide).toBe(true);
    expect(food('d_plov').needsSide).toBe(false);
    expect(food('d_carbonara').needsSide).toBe(false);
    expect(food('d_fried_eggs').needsSide).toBe(false);
    expect(food('d_syrniki').needsSide).toBe(false);
  });

  it('is false for non-main roles', () => {
    for (const f of foods.foods) if (f.role !== 'main') expect(f.needsSide).toBe(false);
  });
});

describe('portionGrid', () => {
  it('gives dishes factors 0.5 to 1.5 in steps of 0.25 with the standard portion first', () => {
    const dish = foods.foods.find((f) => f.role === 'main' && (f.item.portion.pieces ?? 0) < 2);
    if (!dish) throw new Error('no plain dish');
    const grid = portionGrid(dish.item, false);
    expect(grid[0]).toEqual({ kind: 'factor', factor: 1 });
    expect(grid.map((p) => p.factor).sort((a, b) => a - b)).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
  });

  it('gives items counted in pieces whole pieces only', () => {
    const counted = foods.foods.find(
      (f) => (f.item.portion.pieces ?? 0) >= 2 && f.role !== 'drink',
    );
    if (!counted) throw new Error('no pieces item');
    const grid = portionGrid(counted.item, false);
    expect(grid[0]?.kind).toBe('pieces');
    for (const p of grid) {
      expect(p.kind).toBe('pieces');
      expect(Number.isInteger(p.pieces)).toBe(true);
      expect(p.factor).toBeCloseTo((p.pieces ?? 0) / (counted.item.portion.pieces ?? 1), 3);
    }
    const factors = grid.map((p) => p.factor);
    expect(Math.min(...factors)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(Math.max(...factors)).toBeLessThanOrEqual(1.5 + 1e-9);
  });

  it('gives drinks volumes of 200, 250 and 300 ml', () => {
    const drink = foods.foods.find((f) => f.role === 'drink' && (f.item.portion.ml ?? 0) >= 150);
    if (!drink) throw new Error('no drink');
    const grid = portionGrid(drink.item, false);
    expect(grid[0]?.kind).toBe('volume');
    const volumes = new Set(grid.map((p) => p.ml));
    for (const v of [200, 250, 300])
      expect(volumes.has(v) || drink.item.portion.ml === v).toBe(true);
    expect(grid.every((p) => p.kind === 'volume')).toBe(true);
  });

  it('keeps small drinks at one portion', () => {
    const small = foods.foods.find((f) => f.role === 'drink' && (f.item.portion.ml ?? 1000) < 100);
    if (small) expect(portionGrid(small.item, false)).toHaveLength(1);
    const noVolume = foods.foods.find((f) => f.role === 'drink' && f.item.portion.ml === null);
    if (noVolume) expect(portionGrid(noVolume.item, false)).toHaveLength(1);
  });

  it('offers one or two pieces of a fruit counted as one', () => {
    const fruit = foods.foods.find((f) => f.role === 'fruit' && (f.item.portion.pieces ?? 0) < 2);
    if (!fruit) return;
    const grid = portionGrid(fruit.item, false);
    expect(grid.map((p) => p.factor)).toEqual([1, 2]);
  });

  it('gives one portion when fixed', () => {
    const grid = portionGrid(item('d_baked_salmon'), true);
    expect(grid).toHaveLength(1);
    expect(grid[0]?.factor).toBe(1);
  });

  it('is sorted by factor after the standard portion', () => {
    for (const f of foods.foods.slice(0, 80)) {
      const rest = f.portions.slice(1).map((p) => p.factor);
      expect(rest).toEqual([...rest].sort((a, b) => a - b));
    }
  });
});

describe('scaleNutrients', () => {
  it('multiplies known values and keeps unknown ones null', () => {
    const base = item('d_omelette').perPortion;
    const scaled = scaleNutrients(base, 1.5);
    let unknown = 0;
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      const value = base[key];
      if (value === null) {
        unknown += 1;
        expect(scaled[key]).toBeNull();
      } else expect(scaled[key]).toBeCloseTo(value * 1.5);
    }
    expect(unknown).toBeGreaterThanOrEqual(0);
  });

  it('keeps nulls for a vector that has them', () => {
    const withNull = foods.foods.find((f) =>
      Object.values(f.item.perPortion).some((v) => v === null),
    );
    if (!withNull) return;
    const scaled = scaleNutrients(withNull.item.perPortion, 2);
    for (const [key, value] of Object.entries(withNull.item.perPortion))
      if (value === null) expect(scaled[key as keyof typeof scaled]).toBeNull();
  });

  it('is the identity at factor 1', () => {
    const base = item('d_omelette').perPortion;
    expect(scaleNutrients(base, 1)).toEqual(base);
  });
});
