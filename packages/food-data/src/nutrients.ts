/**
 * The nutrient vector of a menu item (ADR 0015): one fixed order everywhere — the food-core arrays, menu-core sums and
 * Kiki's tools. Values are per portion; per 100 g is derived from the portion's grams. `null` means «нет данных», never 0.
 *
 * `retention`: the nutrient has a factor in the USDA Table of Nutrient Retention Factors (Release 6, 2007), so cooking
 * losses are applied to it; the others (vitamins D, E, K, selenium, iodine, fatty acids, caffeine) keep the raw value.
 * `decimals`: rounding of the stored per-portion value.
 */
export const NUTRIENTS = [
  { key: 'energyKcal', unit: 'kcal', decimals: 0, retention: false },
  { key: 'proteinG', unit: 'g', decimals: 1, retention: false },
  { key: 'fatG', unit: 'g', decimals: 1, retention: false },
  { key: 'satFatG', unit: 'g', decimals: 1, retention: false },
  /** Available carbohydrate: by difference minus dietary fibre (stage 3, §5.3). */
  { key: 'carbsG', unit: 'g', decimals: 1, retention: false },
  { key: 'sugarsG', unit: 'g', decimals: 1, retention: false },
  /** Sugars of the ingredients that are added-sugar sources (sugar, honey, syrups, jam, condensed milk…). */
  { key: 'addedSugarsG', unit: 'g', decimals: 1, retention: false },
  /** WHO free sugars: added sugars plus the sugars of fruit juices. */
  { key: 'freeSugarsG', unit: 'g', decimals: 1, retention: false },
  { key: 'fibreG', unit: 'g', decimals: 1, retention: false },
  /** Water of the cooked portion: its weight minus the dry matter of the ingredients. */
  { key: 'waterG', unit: 'g', decimals: 0, retention: false },
  { key: 'sodiumMg', unit: 'mg', decimals: 0, retention: true },
  { key: 'potassiumMg', unit: 'mg', decimals: 0, retention: true },
  { key: 'calciumMg', unit: 'mg', decimals: 0, retention: true },
  { key: 'ironMg', unit: 'mg', decimals: 2, retention: true },
  { key: 'magnesiumMg', unit: 'mg', decimals: 0, retention: true },
  { key: 'zincMg', unit: 'mg', decimals: 2, retention: true },
  { key: 'phosphorusMg', unit: 'mg', decimals: 0, retention: true },
  { key: 'seleniumUg', unit: 'µg', decimals: 1, retention: false },
  { key: 'iodineUg', unit: 'µg', decimals: 1, retention: false },
  /** Retinol activity equivalents. */
  { key: 'vitaminAUg', unit: 'µg', decimals: 0, retention: true },
  { key: 'vitaminCMg', unit: 'mg', decimals: 1, retention: true },
  { key: 'vitaminDUg', unit: 'µg', decimals: 2, retention: false },
  /** Alpha-tocopherol. */
  { key: 'vitaminEMg', unit: 'mg', decimals: 2, retention: false },
  /** Phylloquinone. */
  { key: 'vitaminKUg', unit: 'µg', decimals: 1, retention: false },
  { key: 'thiaminMg', unit: 'mg', decimals: 3, retention: true },
  { key: 'riboflavinMg', unit: 'mg', decimals: 3, retention: true },
  { key: 'niacinMg', unit: 'mg', decimals: 2, retention: true },
  { key: 'vitaminB6Mg', unit: 'mg', decimals: 3, retention: true },
  { key: 'vitaminB12Ug', unit: 'µg', decimals: 2, retention: true },
  /** Dietary folate equivalents; without US folic-acid fortification it equals food folate. */
  { key: 'folateUgDfe', unit: 'µg', decimals: 0, retention: true },
  { key: 'cholesterolMg', unit: 'mg', decimals: 0, retention: false },
  { key: 'caffeineMg', unit: 'mg', decimals: 0, retention: false },
  /** Alpha-linolenic acid (18:3 n-3); where SR Legacy gives only undifferentiated 18:3, that value. */
  { key: 'alaG', unit: 'g', decimals: 2, retention: false },
  /** EPA (20:5 n-3) + DHA (22:6 n-3). */
  { key: 'epaDhaG', unit: 'g', decimals: 2, retention: false },
] as const;

export type NutrientKey = (typeof NUTRIENTS)[number]['key'];
export type NutrientVector = Record<NutrientKey, number | null>;

export const NUTRIENT_KEYS: readonly NutrientKey[] = NUTRIENTS.map((n) => n.key);
export const NUTRIENT_INDEX: ReadonlyMap<NutrientKey, number> = new Map(
  NUTRIENT_KEYS.map((key, i) => [key, i]),
);

/** Salt equivalent of sodium (g of salt = g of sodium × 2.5, TR CU 022/2011). */
export const SALT_PER_SODIUM = 2.5;

export const emptyVector = (): NutrientVector =>
  Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null])) as NutrientVector;

/** Vector ↔ array in NUTRIENTS order (the stored form). */
export const toArray = (v: NutrientVector): (number | null)[] => NUTRIENT_KEYS.map((key) => v[key]);
export function fromArray(values: readonly (number | null)[]): NutrientVector {
  if (values.length !== NUTRIENT_KEYS.length)
    throw new Error(`nutrient array of ${values.length}, expected ${NUTRIENT_KEYS.length}`);
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key, i) => [key, values[i] ?? null]),
  ) as NutrientVector;
}

/** Per 100 g from per portion (the portion's cooked weight). */
export function per100g(perPortion: NutrientVector, portionGrams: number): NutrientVector {
  const k = 100 / portionGrams;
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      const v = perPortion[key];
      return [key, v === null ? null : v * k];
    }),
  ) as NutrientVector;
}

/** Rounds every value to its stored precision (half away from zero; negatives clamp to 0). */
export function roundVector(v: NutrientVector): NutrientVector {
  return Object.fromEntries(
    NUTRIENTS.map(({ key, decimals }) => {
      const value = v[key];
      if (value === null) return [key, null];
      const f = 10 ** decimals;
      return [key, Math.round(Math.max(0, value) * f) / f];
    }),
  ) as NutrientVector;
}
