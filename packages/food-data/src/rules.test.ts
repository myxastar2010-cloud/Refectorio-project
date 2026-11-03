import { describe, expect, it } from 'vitest';
import { ingredientAllergens, ingredientAnimal, ingredientTraces } from './allergens';
import {
  emptyVector,
  fromArray,
  NUTRIENT_INDEX,
  NUTRIENT_KEYS,
  per100g,
  roundVector,
  SALT_PER_SODIUM,
  toArray,
} from './nutrients';
import {
  FRESH_IN_ASSEMBLED,
  HEATS,
  RETENTION_CODES,
  retentionClass,
  retentionCode,
} from './retention';

const sr = (description: string, category: number, fatG: number | null = null) => ({
  id: 'i_1',
  description,
  category,
  fatG,
});

describe('allergens of an ingredient (research/R07)', () => {
  it.each([
    ['Butter, without salt', ['MILK']],
    ['Wheat flour, white, all-purpose, unenriched', ['GLUTEN']],
    ['Soy sauce made from soy and wheat (shoyu)', ['GLUTEN', 'SOY']],
    ['Mollusks, mussel, blue, raw', ['MOLLUSC']],
    ['Alcoholic beverage, wine, table, red', ['SULPHITES']],
    ['Apricots, dried, sulfured, uncooked', ['SULPHITES']],
    ['Seeds, sesame butter, tahini', ['SESAME']],
  ])('%s → %j', (description, codes) => {
    expect(ingredientAllergens({ id: 'i_1', description })).toEqual(codes);
  });

  it.each([
    'Soymilk, original and vanilla, unfortified',
    'Nuts, coconut milk, raw',
    'Buckwheat groats, roasted, dry',
    'Spices, nutmeg, ground',
    'Eggplant, raw',
    'Mushrooms, oyster, raw',
    'Vinegar, red wine',
  ])('%s is not the allergen its words suggest', (description) => {
    const codes = ingredientAllergens({ id: 'i_1', description });
    expect(
      codes.filter((c) =>
        ['MILK', 'TREE_NUT', 'GLUTEN', 'EGG', 'MOLLUSC', 'SULPHITES'].includes(c),
      ),
    ).toEqual([]);
  });

  it('takes a label food from its product, not from its id', () => {
    expect(ingredientAllergens({ id: 'ru:kefir-2.5', description: 'ru:kefir-2.5' })).toEqual([
      'MILK',
    ]);
    expect(ingredientAllergens({ id: 'ru:gochujang', description: 'ru:gochujang' })).toEqual([
      'GLUTEN',
      'SOY',
    ]);
  });
});

describe('traces of a bought ingredient (research/R07 §5, §7)', () => {
  it.each([
    ['Nuts, almonds', 12, ['PEANUT']],
    ['Nuts, coconut milk, raw', 12, []],
    ['Peanuts, all types, dry-roasted, without salt', 16, ['TREE_NUT']],
    ['Seeds, sesame seeds, whole, dried', 12, ['PEANUT', 'TREE_NUT']],
    ['Seeds, pumpkin and squash seed kernels, dried', 12, ['PEANUT', 'TREE_NUT', 'SESAME']],
    ['Cereals ready-to-eat, granola, homemade', 8, ['PEANUT', 'TREE_NUT']],
    ['Apricots, dried, sulfured, uncooked', 9, []],
    ['Chocolate, dark, 45- 59% cacao solids', 19, ['MILK', 'PEANUT', 'TREE_NUT']],
    ['Buckwheat groats, roasted, dry', 20, ['GLUTEN']],
    ['Lentils, raw', 16, ['GLUTEN']],
    ['Bread, rye', 18, ['SESAME']],
    ['Pasta, dry, unenriched', 20, ['EGG']],
    ['Noodles, egg, dry, unenriched', 20, []],
    ['Rice, white, long-grain, regular, raw, unenriched', 20, []],
  ])('%s → %j', (description, category, codes) => {
    expect(ingredientTraces({ id: 'i_1', description, category })).toEqual(codes);
  });

  it('gives a label food none: its label already lists them', () => {
    expect(
      ingredientTraces({ id: 'ru:tvorog-5', description: 'ru:tvorog-5', category: 0 }),
    ).toEqual([]);
  });
});

describe('animal facts of an ingredient', () => {
  it('sees meat in a broth, fish in a fish sauce, and none in beans', () => {
    expect(
      ingredientAnimal({
        id: 'i_1',
        description: 'Soup, chicken broth, ready-to-serve',
        category: 6,
      }).meat,
    ).toBe(true);
    expect(
      ingredientAnimal({ id: 'i_1', description: 'Sauce, fish, ready-to-serve', category: 6 }).fish,
    ).toBe(true);
    expect(
      ingredientAnimal({
        id: 'i_1',
        description: 'Beans, kidney, red, mature seeds, raw',
        category: 16,
      }),
    ).toEqual({ meat: false, fish: false, dairy: false, egg: false, honey: false, gelatin: false });
    expect(
      ingredientAnimal({
        id: 'i_1',
        description: 'Gelatins, dry powder, unsweetened',
        category: 19,
      }).gelatin,
    ).toBe(true);
    expect(ingredientAnimal({ id: 'i_1', description: 'Honey', category: 19 }).honey).toBe(true);
  });
});

describe('retention classes and codes (USDA RF6, research/R18 §T3b)', () => {
  it.each([
    [sr('Carrots, raw', 11), 'vegRoots'],
    [sr('Spinach, raw', 11), 'vegGreens'],
    [sr('Potatoes, flesh and skin, raw', 11), 'potatoes'],
    [sr('Tomatoes, red, ripe, raw, year round average', 11), 'tomatoes'],
    [sr('Parsley, fresh', 11), null],
    [sr('Beans, kidney, red, mature seeds, raw', 16), 'legumesLong'],
    [sr('Lentils, raw', 16), 'legumesQuick'],
    [sr('Chickpeas (garbanzo beans, bengal gram), mature seeds, canned', 16), 'legumesCanned'],
    [sr('Fish, salmon, Atlantic, farmed, raw', 15, 13.4), 'fishFat'],
    [sr('Fish, cod, Atlantic, raw', 15, 0.7), 'fishLean'],
    [sr('Fish, herring, Atlantic, pickled', 15, 18), null],
    [sr('Crustaceans, shrimp, raw', 15, 0.5), 'shellfish'],
    [sr('Milk, whole, 3.25% milkfat, without added vitamin A and vitamin D', 1), 'milk'],
    [sr('Egg, whole, raw, fresh', 1), 'eggs'],
    [sr('Egg, whole, cooked, hard-boiled', 1), null],
    [sr('Rice, white, long-grain, regular, raw, unenriched', 20), 'rice'],
    [sr('Bread, rye', 18), null],
  ])('%j → %s', (facts, cls) => {
    expect(retentionClass(facts)).toBe(cls);
  });

  it('gives no code to a raw dish or a raw ingredient, and the table code otherwise', () => {
    const cabbage = sr('Cabbage, raw', 11);
    expect(retentionCode(cabbage, 'none')).toBeNull();
    expect(retentionCode(cabbage, 'stew', true)).toBeNull();
    expect(retentionCode(cabbage, 'boil-drain')).toBe(RETENTION_CODES.vegOther['boil-drain']);
    expect(retentionCode(sr('Semolina, unenriched', 20), 'bake')).toBe(RETENTION_CODES.flour.bake);
  });

  it('has a four-digit code wherever a class names one, and keeps salads fresh', () => {
    for (const codes of Object.values(RETENTION_CODES))
      for (const code of Object.values(codes)) expect(code).toMatch(/^\d{4}$/);
    expect(HEATS[0]).toBe('none');
    expect(FRESH_IN_ASSEMBLED.has('vegOther')).toBe(true);
    expect(FRESH_IN_ASSEMBLED.has('potatoes')).toBe(false);
  });
});

describe('nutrient vectors', () => {
  it('has one fixed order of unique keys', () => {
    expect(new Set(NUTRIENT_KEYS).size).toBe(NUTRIENT_KEYS.length);
    expect(NUTRIENT_INDEX.get('energyKcal')).toBe(0);
    expect(SALT_PER_SODIUM).toBe(2.5);
  });

  it('round-trips through the stored array and refuses another length', () => {
    const v = { ...emptyVector(), energyKcal: 120, sodiumMg: 10 };
    expect(fromArray(toArray(v))).toEqual(v);
    expect(() => fromArray([1, 2, 3])).toThrow(/expected/);
  });

  it('derives per 100 g from the portion and keeps «no data»', () => {
    const v = per100g({ ...emptyVector(), energyKcal: 50, ironMg: 1 }, 250);
    expect(v.energyKcal).toBe(20);
    expect(v.ironMg).toBe(0.4);
    expect(v.vitaminDUg).toBeNull();
  });

  it('rounds to the stored precision, half away from zero, clamping negatives', () => {
    const v = roundVector({
      ...emptyVector(),
      energyKcal: 120.5,
      ironMg: 1.005,
      proteinG: -0.2,
      thiaminMg: 0.12345,
    });
    expect(v.energyKcal).toBe(121);
    expect(v.proteinG).toBe(0);
    expect(v.thiaminMg).toBe(0.123);
    expect(v.vitaminCMg).toBeNull();
  });
});
