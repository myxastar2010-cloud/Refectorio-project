import type { QuizAnswersV1 } from '@refectorio/contracts';
import { NUTRIENTS, SALT_PER_SODIUM, type NutrientKey } from '@refectorio/food-data';
import type { DayTargets, ItemView, PlannedItem } from '@refectorio/menu-core';
import type { AllergenCode } from '@refectorio/nutrition-core';

/**
 * The numbers of the dish details (ТЗ фаза 4 §8) — all from the data and the person's targets, nothing estimated here:
 * this day's portion (the engine's nutrients for it), per 100 g (the data's own) and the share of the day's target.
 */

export type Unit = 'kcal' | 'g' | 'mg' | 'ug';

const UNIT_OF: ReadonlyMap<NutrientKey, Unit> = new Map(
  NUTRIENTS.map((n) => [n.key, n.unit === 'µg' ? 'ug' : n.unit] as const),
);
export const unitOf = (key: NutrientKey): Unit => UNIT_OF.get(key) ?? 'g';

export type MacroRow = {
  readonly id:
    'energy' | 'protein' | 'fat' | 'satFat' | 'carbs' | 'sugars' | 'addedSugars' | 'fibre' | 'salt';
  readonly unit: Unit;
  readonly perPortion: number | null;
  readonly per100: number | null;
  /** Share of the day's target (or of its upper limit: saturated fat, salt); null — no target for it. */
  readonly share: number | null;
  /** A part of the row above («в т. ч.»). */
  readonly sub: boolean;
};

const ratio = (value: number | null, of: number | undefined): number | null =>
  value === null || !of ? null : value / of;
const salt = (sodiumMg: number | null): number | null =>
  sodiumMg === null ? null : (sodiumMg * SALT_PER_SODIUM) / 1000;

export function macroRows(item: PlannedItem, view: ItemView, targets: DayTargets): MacroRow[] {
  const p = item.nutrients;
  const h = view.per100g;
  const row = (
    id: MacroRow['id'],
    key: NutrientKey,
    target: number | undefined,
    sub = false,
  ): MacroRow => ({
    id,
    unit: unitOf(key),
    perPortion: p[key],
    per100: h[key],
    share: ratio(p[key], target),
    sub,
  });
  return [
    row('energy', 'energyKcal', targets.energyKcal),
    row('protein', 'proteinG', targets.proteinG.target),
    row('fat', 'fatG', targets.fatG.target),
    row('satFat', 'satFatG', targets.satFatMaxG, true),
    row('carbs', 'carbsG', targets.carbsG.target),
    row('sugars', 'sugarsG', undefined),
    row('addedSugars', 'addedSugarsG', undefined, true),
    row('fibre', 'fibreG', targets.fibreG.target),
    {
      id: 'salt',
      unit: 'g',
      perPortion: salt(p.sodiumMg),
      per100: salt(h.sodiumMg),
      share: ratio(salt(p.sodiumMg), salt(targets.sodiumMaxMg) ?? undefined),
      sub: false,
    },
  ];
}

export const VITAMINS: readonly NutrientKey[] = [
  'vitaminAUg',
  'vitaminCMg',
  'vitaminDUg',
  'vitaminEMg',
  'vitaminKUg',
  'thiaminMg',
  'riboflavinMg',
  'niacinMg',
  'vitaminB6Mg',
  'folateUgDfe',
  'vitaminB12Ug',
];
export const MINERALS: readonly NutrientKey[] = [
  'calciumMg',
  'ironMg',
  'magnesiumMg',
  'phosphorusMg',
  'potassiumMg',
  'zincMg',
  'seleniumUg',
  'iodineUg',
];

export type MicroRow = {
  readonly key: NutrientKey;
  readonly unit: Unit;
  readonly value: number | null;
  /** The person's daily norm (МР 2.3.1.0253-21; potassium — the plan's floor); null — none for this person. */
  readonly norm: number | null;
  readonly share: number | null;
};

export function microRows(
  item: PlannedItem,
  targets: DayTargets,
  keys: readonly NutrientKey[],
): MicroRow[] {
  return keys.map((key) => {
    const norm =
      key === 'potassiumMg' ? targets.potassiumMinMg : (targets.micros[key]?.norm ?? null);
    const value = item.nutrients[key];
    return { key, unit: unitOf(key), value, norm, share: ratio(value, norm ?? undefined) };
  });
}

/** The ingredients of this day's portion: the standard portion's grams times the engine's factor. */
export function portionIngredients(view: ItemView, item: PlannedItem) {
  return view.ingredients.map((ingredient) => ({
    ...ingredient,
    g: ingredient.g * item.portion.factor,
  }));
}

export type AllergenCheck = {
  readonly code: AllergenCode;
  readonly state: 'absent' | 'servedWithout' | 'trace' | 'present';
};

/**
 * The person's allergies against this dish. The engine never plans a dish with one of them, so `present` would mean a
 * data error: the page says so plainly instead of hiding it.
 */
export function allergenChecks(answers: QuizAnswersV1 | null, view: ItemView, item: PlannedItem) {
  const items = answers?.allergies.items ?? [];
  const checks: AllergenCheck[] = items.map(({ code }) => ({
    code,
    state: item.servedWithout?.includes(code)
      ? 'servedWithout'
      : view.allergens.includes(code) || view.servingAllergens.includes(code)
        ? 'present'
        : view.traces.includes(code)
          ? 'trace'
          : 'absent',
  }));
  return { checks, custom: answers?.allergies.custom ?? [] };
}
