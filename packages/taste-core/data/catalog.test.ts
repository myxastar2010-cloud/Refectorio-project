import { describe, expect, it } from 'vitest';
import {
  CARB_BASES,
  catalogSchema,
  COOKING_METHODS,
  COURSES,
  CUISINES,
  dietFlags,
  FLAVOURS,
  MEAL_TYPES,
  photoQueriesSchema,
  PROTEINS,
  TEXTURES,
  type BASE_TYPES,
  type Dish,
} from '../src/catalog';
import catalogJson from './catalog.json';
import photoQueriesJson from './photo-queries.json';

const catalog = catalogSchema.parse(catalogJson);
const dishes = catalog.dishes;

/** Minimum dishes per base type (ТЗ §9.2: balanced across base types). */
const QUOTAS: Record<(typeof BASE_TYPES)[number], number> = {
  breakfast: 12,
  soup: 12,
  salad: 10,
  meatMain: 12,
  poultryMain: 8,
  fishMain: 8,
  seafoodMain: 5,
  vegMain: 10,
  pastaGrains: 10,
  asian: 12,
  caucasianCentralAsian: 10,
  baking: 8,
  dessert: 12,
  snack: 8,
};

const count = (predicate: (dish: Dish) => boolean) => dishes.filter(predicate).length;

describe('dish catalog', () => {
  it('has 150–200 dishes with unique ids and names', () => {
    expect(dishes.length).toBeGreaterThanOrEqual(150);
    expect(dishes.length).toBeLessThanOrEqual(200);
    expect(new Set(dishes.map((d) => d.id)).size).toBe(dishes.length);
    expect(new Set(dishes.map((d) => d.nameRu.toLowerCase())).size).toBe(dishes.length);
  });

  it('meets the quota of every base type', () => {
    for (const [baseType, min] of Object.entries(QUOTAS)) {
      expect(
        count((d) => d.baseType === baseType),
        baseType,
      ).toBeGreaterThanOrEqual(min);
    }
  });

  it('uses every feature value in at least 3 dishes', () => {
    const uses = (values: readonly string[], of: (dish: Dish) => readonly string[]) => {
      for (const value of values) {
        expect(
          count((d) => of(d).includes(value)),
          value,
        ).toBeGreaterThanOrEqual(3);
      }
    };
    uses(COURSES, (d) => [d.course]);
    uses(MEAL_TYPES, (d) => d.mealTypes);
    uses(CUISINES, (d) => [d.cuisine]);
    uses(PROTEINS, (d) => d.proteins);
    uses(COOKING_METHODS, (d) => d.cookingMethods);
    uses(CARB_BASES, (d) => [d.carbBase]);
    uses(FLAVOURS, (d) => d.flavours);
    uses(TEXTURES, (d) => d.textures);
  });

  it('gives vegetarians and vegans enough dishes to like', () => {
    expect(count((d) => dietFlags(d).vegetarian)).toBeGreaterThanOrEqual(45);
    expect(count((d) => dietFlags(d).vegan)).toBeGreaterThanOrEqual(18);
    expect(
      count((d) => dietFlags(d).pescatarian && !dietFlags(d).vegetarian),
    ).toBeGreaterThanOrEqual(15);
  });

  it('keeps flags consistent: the main protein agrees with the allergens', () => {
    for (const dish of dishes) {
      if (dish.proteins.includes('fish')) expect(dish.allergens, dish.id).toContain('FISH');
      if (dish.proteins.includes('eggs')) expect(dish.allergens, dish.id).toContain('EGG');
      if (dish.proteins.includes('dairy')) expect(dish.allergens, dish.id).toContain('MILK');
      if (dish.proteins.includes('none')) expect(dish.proteins, dish.id).toEqual(['none']);
      if (dish.carbBase === 'pasta' || dish.carbBase === 'bread' || dish.carbBase === 'dough') {
        expect(dish.allergens, dish.id).toContain('GLUTEN');
      }
      expect(new Set(dish.allergens).size, dish.id).toBe(dish.allergens.length);
    }
  });

  it('has no alcohol and no brands', () => {
    const banned =
      /(вин[оа]|пив[оа]|водк|коньяк|ликёр|ликер|ром\b|виски|кока-кол|макдон|kfc|nutella|нутелл)/i;
    for (const dish of dishes) {
      expect(banned.test(`${dish.nameRu} ${dish.altRu}`), dish.id).toBe(false);
    }
  });

  it('has 1–3 English photo queries for every dish and nothing else', () => {
    const queries = photoQueriesSchema.parse(photoQueriesJson);
    expect(Object.keys(queries).sort()).toEqual(dishes.map((d) => d.id).sort());
    for (const list of Object.values(queries)) {
      for (const query of list) expect(query, query).toMatch(/^[a-z0-9 ,'-]+$/i);
    }
  });

  it('spreads familiarity: well-known dishes for skip-prone players, novelties for the curious', () => {
    expect(count((d) => d.traits.familiarityRu >= 0.85)).toBeGreaterThanOrEqual(40);
    expect(count((d) => d.traits.familiarityRu <= 0.5)).toBeGreaterThanOrEqual(20);
  });
});
