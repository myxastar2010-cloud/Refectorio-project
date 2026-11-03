import { describe, expect, it } from 'vitest';
import {
  checkPortion,
  computeRecipe,
  FAT_KCAL_PER_G,
  WATER_ID,
  type IngredientRecord,
  type Recipe,
  type RetentionTable,
} from './compute';
import { emptyVector, type NutrientVector } from './nutrients';
import { retentionCode } from './retention';

const food = (
  id: string,
  description: string,
  category: number,
  values: Partial<NutrientVector>,
): IngredientRecord => ({ id, description, category, per100g: { ...emptyVector(), ...values } });

// Round figures in the shape of SR Legacy rows (the arithmetic, not the foods, is under test).
const cabbage = food('i_1', 'Cabbage, raw', 11, {
  energyKcal: 25,
  proteinG: 1.3,
  fatG: 0.1,
  carbsG: 3.3,
  fibreG: 2.5,
  waterG: 92.2,
  vitaminCMg: 36.6,
  vitaminAUg: 5,
  sodiumMg: 18,
});
const water = food(WATER_ID, 'Beverages, water, tap, drinking', 14, {
  energyKcal: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  fibreG: 0,
  waterG: 99.9,
  sodiumMg: 4,
  vitaminCMg: 0,
  vitaminAUg: 0,
});
const oil = food('i_3', 'Oil, sunflower, linoleic, (approx. 65%)', 4, {
  energyKcal: 884,
  proteinG: 0,
  fatG: 100,
  satFatG: 9,
  carbsG: 0,
  fibreG: 0,
  waterG: 0,
  sodiumMg: 0,
  vitaminCMg: 0,
  vitaminAUg: 0,
});
const pepper = food('i_4', 'Spices, pepper, black', 2, {
  energyKcal: 251,
  proteinG: 10,
  fatG: 3,
  waterG: 12,
});
const beef = food('i_5', 'Beef, chuck, raw', 13, {
  energyKcal: 180,
  proteinG: 20,
  fatG: 10,
  satFatG: 4,
  carbsG: 0,
  fibreG: 0,
  waterG: 69,
  vitaminCMg: 0,
  vitaminAUg: 0,
  sodiumMg: 60,
});
const ingredients = Object.fromEntries([cabbage, water, oil, pepper, beef].map((f) => [f.id, f]));
const facts = (f: IngredientRecord) => ({
  description: f.description,
  category: f.category,
  fatG: f.per100g.fatG,
});
const soupCode = retentionCode(facts(cabbage), 'boil-keep');
if (soupCode === null) throw new Error('cabbage has a boil-keep code');
const retention: RetentionTable = { [soupCode]: { vitaminCMg: 50, sodiumMg: 100 } };
/** The codes of the fried and roasted tests, with no losses: only the fat is under test there. */
const noLoss: RetentionTable = Object.fromEntries(
  [
    retentionCode(facts(cabbage), 'deepfry'),
    retentionCode(facts(cabbage), 'fry'),
    retentionCode(facts(beef), 'bake'),
    retentionCode(facts(beef), 'fry'),
  ].flatMap((code) => (code ? [[code, {}]] : [])),
);

const recipe = (over: Partial<Recipe>): Recipe => ({
  portion: { grams: 450, ml: null, pieces: null },
  heat: 'boil-keep',
  assembled: false,
  ingredients: [
    { id: cabbage.id, g: 200 },
    { id: WATER_ID, g: 300 },
  ],
  frying: null,
  meatFat: null,
  ...over,
});

describe('computeRecipe', () => {
  it('sums raw grams × per 100 g and applies the retention factor of the ingredient', () => {
    const { perPortion: v, codes } = computeRecipe(recipe({}), ingredients, retention);
    expect(codes[cabbage.id]).toBe(soupCode);
    expect(v.energyKcal).toBeCloseTo(50, 9);
    expect(v.vitaminCMg).toBeCloseTo(36.6 * 2 * 0.5, 9);
    // Sodium of cabbage (100 % retained) + the drinking water's.
    expect(v.sodiumMg).toBeCloseTo(36 + 12, 9);
  });

  it('derives the water of the cooked portion from its weight and the dry matter', () => {
    const { perPortion: v } = computeRecipe(recipe({}), ingredients, retention);
    const solids = (200 * (100 - 92.2)) / 100 + (300 * 0.1) / 100;
    expect(v.waterG).toBeCloseTo(450 - solids, 9);
  });

  it('keeps the fresh vegetables of an assembled dish raw', () => {
    const { perPortion: v, codes } = computeRecipe(
      recipe({ assembled: true }),
      ingredients,
      retention,
    );
    expect(codes[cabbage.id]).toBeNull();
    expect(v.vitaminCMg).toBeCloseTo(36.6 * 2, 9);
  });

  it('counts a nutrient missing in a sliver of the mass as 0, and says «no data» when more is missing', () => {
    const pinch = computeRecipe(
      recipe({
        ingredients: [
          { id: cabbage.id, g: 200 },
          { id: pepper.id, g: 2 },
          { id: WATER_ID, g: 300 },
        ],
      }),
      ingredients,
      retention,
    );
    expect(pinch.coverage.vitaminAUg).toBeCloseTo(200 / 202, 9);
    expect(pinch.perPortion.vitaminAUg).toBeCloseTo(10, 9);
    const lot = computeRecipe(
      recipe({
        ingredients: [
          { id: cabbage.id, g: 200 },
          { id: pepper.id, g: 50 },
        ],
      }),
      ingredients,
      retention,
    );
    expect(lot.perPortion.vitaminAUg).toBeNull();
    // Nothing anywhere: unknown, not zero.
    expect(lot.perPortion.vitaminKUg).toBeNull();
  });

  it('adds the frying fat on everything in the pan, the water of a batter included', () => {
    const frying = { oil: oil.id, fatGPer100g: 10, fried: null };
    const { perPortion: v } = computeRecipe(
      recipe({
        heat: 'deepfry',
        ingredients: [
          { id: cabbage.id, g: 100 },
          { id: WATER_ID, g: 50 },
        ],
        frying,
      }),
      ingredients,
      noLoss,
    );
    // 10 g per 100 g of 150 g in the pan = 15 g of oil.
    expect(v.fatG).toBeCloseTo(0.1 + 15, 9);
    expect(v.energyKcal).toBeCloseTo(25 + 15 * 8.84, 9);
    const listed = computeRecipe(
      recipe({
        heat: 'fry',
        ingredients: [
          { id: cabbage.id, g: 100 },
          { id: WATER_ID, g: 50 },
        ],
        frying: { ...frying, fried: [cabbage.id] },
      }),
      ingredients,
      noLoss,
    );
    expect(listed.perPortion.fatG).toBeCloseTo(0.1 + 10, 9);
  });

  it('adds the fat a roasted cut gains, and never together with frying fat', () => {
    const meatFat = { cut: beef.id, fatChangeGPer100gRaw: 2 };
    const roast = recipe({ heat: 'bake', ingredients: [{ id: beef.id, g: 150 }], meatFat });
    const { perPortion: v } = computeRecipe(roast, ingredients, noLoss);
    expect(v.fatG).toBeCloseTo(15 + 3, 9);
    expect(v.energyKcal).toBeCloseTo(270 + 3 * FAT_KCAL_PER_G, 9);
    expect(v.satFatG).toBeCloseTo(6 + (3 * 4) / 10, 9);
    const fried = computeRecipe(
      { ...roast, heat: 'fry', frying: { oil: oil.id, fatGPer100g: 0, fried: null } },
      ingredients,
      noLoss,
    );
    expect(fried.perPortion.fatG).toBeCloseTo(15, 9);
  });

  it('refuses an unknown ingredient, a missing retention code and a cut that is not in the recipe', () => {
    expect(() =>
      computeRecipe(recipe({ ingredients: [{ id: 'i_9', g: 1 }] }), ingredients, retention),
    ).toThrow(/unknown ingredient/);
    expect(() => computeRecipe(recipe({}), ingredients, {})).toThrow(/no retention factors/);
    expect(() =>
      computeRecipe(
        recipe({ meatFat: { cut: beef.id, fatChangeGPer100gRaw: 1 } }),
        ingredients,
        retention,
      ),
    ).toThrow(/is not an ingredient/);
  });
});

describe('checkPortion', () => {
  const ok: NutrientVector = {
    ...emptyVector(),
    energyKcal: 200,
    proteinG: 10,
    fatG: 8,
    satFatG: 2,
    carbsG: 22,
    sugarsG: 5,
    addedSugarsG: 2,
    fibreG: 2,
    waterG: 150,
    sodiumMg: 300,
  };

  it('accepts a consistent portion', () => {
    expect(checkPortion(ok, 200)).toEqual([]);
  });

  it('flags energy that disagrees with 4 P + 9 F + 4 C + 2 fibre', () => {
    expect(checkPortion({ ...ok, energyKcal: 300 }, 200)).toEqual([
      'energy 300 kcal vs 4P+9F+4C+2fibre 204 kcal',
    ]);
  });

  it('flags impossible and implausible values', () => {
    expect(checkPortion({ ...ok, sugarsG: 30 }, 200)).toContain('sugars > carbohydrate');
    expect(checkPortion({ ...ok, addedSugarsG: 6 }, 200)).toContain('added sugars > total sugars');
    expect(checkPortion({ ...ok, satFatG: 9 }, 200)).toContain('saturated fat > fat');
    expect(checkPortion({ ...ok, waterG: 250 }, 200)).toContain('water > portion');
    expect(checkPortion({ ...ok, waterG: 0 }, 200)).toContain(
      'no water left: portion lighter than its dry matter',
    );
    expect(checkPortion({ ...ok, sodiumMg: 6000 }, 200)).toContain(
      'sodiumMg 3000.0 per 100 g > 2500',
    );
  });
});
