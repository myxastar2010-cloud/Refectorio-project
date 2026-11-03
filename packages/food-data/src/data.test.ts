import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { catalogSchema, dishTextSchema, type Catalog } from '@refectorio/taste-core';
import catalogJson from '@refectorio/taste-core/data/catalog.json';
import dishNumbersJson from '@refectorio/taste-core/data/dish-numbers.json';
import dishTextJson from '@refectorio/taste-core/data/dish-text.json';
import { describe, expect, it } from 'vitest';
import foodCoreJson from '../data/food-core.json';
import foodTextJson from '../data/food-text.json';
import ingredientsJson from '../data/src/ingredients.json';
import itemsJson from '../data/src/items.json';
import recipesJson from '../data/src/recipes.json';
import retentionJson from '../data/src/retention.json';
import textsJson from '../data/src/texts.json';
import { assemble, type AssembleInput } from './assemble';
import { checkPortion } from './compute';
import { decodeFoodCore } from './decode';
import { NUTRIENT_KEYS } from './nutrients';
import { foodCoreSchema, foodTextSchema, itemsFileSchema } from './schema';
import {
  ingredientsFileSchema,
  recipesFileSchema,
  retentionFileSchema,
  textsFileSchema,
} from './sources';

const core = foodCoreSchema.parse(foodCoreJson);
const text = foodTextSchema.parse(foodTextJson);
const input: AssembleInput = {
  version: core.version,
  catalog: catalogSchema.parse(catalogJson),
  dishText: dishTextSchema.parse(dishTextJson),
  items: itemsFileSchema.parse(itemsJson),
  ingredients: ingredientsFileSchema.parse(ingredientsJson),
  retention: retentionFileSchema.parse(retentionJson),
  recipes: recipesFileSchema.parse(recipesJson),
  texts: textsFileSchema.parse(textsJson),
};
const decoded = decodeFoodCore(foodCoreJson);
const byId = new Map(decoded.items.map((item) => [item.id, item]));
const item = (id: string) => {
  const found = byId.get(id);
  if (!found) throw new Error(`no item ${id}`);
  return found;
};
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('the committed food data', () => {
  it('is exactly what the committed sources assemble to, with no problems', () => {
    const out = assemble(input);
    expect(out.problems).toEqual([]);
    expect(plain(out.core)).toEqual(foodCoreJson);
    // The text chunk keeps its own date when only the numbers changed (build/build.ts).
    expect(plain({ ...out.text, version: text.version })).toEqual(foodTextJson);
  });

  it('assembles deterministically: the same sources give the same bytes', () => {
    const hash = () =>
      createHash('sha256')
        .update(JSON.stringify(assemble(input).core))
        .digest('hex');
    expect(hash()).toBe(hash());
  });

  it('covers every game dish and the menu items, each with nutrition and texts', () => {
    expect(decoded.catalogVersion).toBe(input.catalog.version);
    const game = decoded.items.filter((i) => i.flags.has('inGame'));
    expect(game).toHaveLength(input.catalog.dishes.length);
    expect(decoded.items).toHaveLength(
      input.catalog.dishes.length + Object.keys(input.items.menu).length,
    );
    for (const i of decoded.items) {
      for (const key of ['energyKcal', 'proteinG', 'fatG', 'carbsG', 'sodiumMg'] as const)
        expect(i.perPortion[key], `${i.id} ${key}`).not.toBeNull();
      const [name, what, long, short] = text.items[i.id] ?? [];
      expect(name?.length, i.id).toBeGreaterThan(1);
      expect(what?.length, i.id).toBeGreaterThan(1);
      expect(long?.length, i.id).toBeGreaterThanOrEqual(20);
      expect(short?.length, i.id).toBeGreaterThanOrEqual(10);
      expect(i.ingredients.length, i.id).toBeGreaterThan(0);
      for (const ingredient of i.ingredients)
        expect(ingredient.nameRu, `${i.id} ${ingredient.id}`).not.toMatch(/[()]/);
    }
  });

  it('gives a game dish the energy and macronutrients the game card shows', () => {
    const shown: Record<string, readonly number[]> = dishNumbersJson.dishes;
    expect(Object.keys(shown)).toHaveLength(input.catalog.dishes.length);
    for (const [id, [kcal, protein, fat, carbs]] of Object.entries(shown)) {
      const { perPortion: v } = item(id);
      expect([v.energyKcal, v.proteinG, v.fatG, v.carbsG], id).toEqual([kcal, protein, fat, carbs]);
    }
  });

  it('keeps every portion plausible: energy agrees with the macronutrients, per 100 g within range', () => {
    for (const i of decoded.items)
      expect(checkPortion(i.perPortion, i.portion.grams), i.id).toEqual([]);
  });

  it('keeps salt where it belongs: Russian curd and butter are unsalted', () => {
    expect(item('d_tvorog_5').per100g.sodiumMg).toBeLessThan(60);
    const butter = input.ingredients.ingredients.i_173410;
    expect(butter?.sodiumFdcId).toBe(173430);
    expect(item('d_bread_butter').perPortion.sodiumMg).toBeLessThan(250);
  });

  it('marks what is unknown as null, never a silent zero', () => {
    // SR Legacy has iodine for few foods: only the water item is complete.
    const iodine = decoded.items.filter((i) => i.perPortion.iodineUg !== null).map((i) => i.id);
    expect(iodine).toEqual(['d_water']);
    expect(item('d_berries').perPortion.sugarsG).toBeNull();
  });

  it('fits the chunk budgets (ТЗ §6: food-core ≤ 60 KB gz, food-text ≤ 35 KB gz)', () => {
    const gz = (value: unknown) => gzipSync(JSON.stringify(value)).length;
    expect(gz(foodCoreJson)).toBeLessThanOrEqual(60 * 1024);
    expect(gz(foodTextJson)).toBeLessThanOrEqual(35 * 1024);
  });
});

describe('allergens, traces and diets', () => {
  it('never lists an allergen both as contained and as a trace', () => {
    for (const i of decoded.items)
      for (const code of i.traces) expect(i.allergens, i.id).not.toContain(code);
  });

  it('carries the traces of bought ingredients (research/R07 §5, §7)', () => {
    expect(item('d_almonds').allergens).toEqual(['TREE_NUT']);
    expect(item('d_almonds').traces).toEqual(['PEANUT', 'SESAME']);
    expect(item('d_buckwheat_side').traces).toEqual(['GLUTEN']);
    expect(item('d_wheat_bread').traces).toEqual(['SESAME']);
    expect(item('d_pasta_side').traces).toEqual(['EGG']);
    expect(item('d_water').traces).toEqual([]);
    expect(item('d_chicken_curry').traces).toEqual([]);
  });

  it('declares sulphites where a dish is cooked with wine', () => {
    for (const id of [
      'd_spaghetti_bolognese',
      'd_mushroom_risotto',
      'd_mussels',
      'd_garlic_shrimp',
    ])
      expect(item(id).allergens, id).toContain('SULPHITES');
  });

  const mutated = (id: string, change: (dish: Catalog['dishes'][number]) => void): string[] => {
    const catalog = structuredClone(input.catalog);
    const dish = catalog.dishes.find((d) => d.id === id);
    if (!dish) throw new Error(`no dish ${id}`);
    change(dish);
    return [...assemble({ ...input, catalog }).problems];
  };

  it('catches a «vegan» dish with butter and milk', () => {
    const problems = mutated('d_mashed_potatoes', (dish) => {
      dish.allergens = [];
    });
    expect(problems).toContain('d_mashed_potatoes: catalog says vegan, the recipe is not');
    expect(problems.some((p) => p.startsWith('d_mashed_potatoes: MILK from'))).toBe(true);
  });

  it('catches a gluten-free dish with flour and a missing egg', () => {
    const problems = mutated('d_syrniki', (dish) => {
      dish.allergens = ['MILK'];
    });
    expect(problems.some((p) => p.startsWith('d_syrniki: GLUTEN from «Wheat flour'))).toBe(true);
    expect(problems.some((p) => p.startsWith('d_syrniki: EGG from'))).toBe(true);
  });

  it('gives a menu item the allergens of its ingredients and the diets they allow', () => {
    expect(item('d_kefir').allergens).toEqual(['MILK']);
    expect(item('d_kefir').flags.has('vegan')).toBe(false);
    expect(item('d_tofu_scramble').flags.has('vegan')).toBe(true);
    expect(item('d_oatmeal_plant_milk').allergens).toEqual(['GLUTEN', 'SOY']);
  });
});

describe('decodeFoodCore', () => {
  it('resolves ingredients and derives per 100 g from the portion', () => {
    const kefir = item('d_kefir');
    expect(kefir.ingredients).toEqual([{ id: 'ru:kefir-2.5', nameRu: 'кефир 2,5 %', g: 208 }]);
    expect(kefir.per100g.energyKcal).toBeCloseTo(
      ((kefir.perPortion.energyKcal ?? 0) * 100) / 208,
      6,
    );
  });

  it('refuses a chunk of another nutrient order or with a broken ingredient index', () => {
    expect(() => decodeFoodCore({ ...core, nutrients: [...NUTRIENT_KEYS].reverse() })).toThrow(
      /nutrient order/,
    );
    const [first, ...rest] = core.items;
    if (!first) throw new Error('empty chunk');
    const broken = { ...core, items: [{ ...first, i: [[core.ingredients.length, 1]] }, ...rest] };
    expect(() => decodeFoodCore(broken)).toThrow(/refers to ingredient/);
  });
});
