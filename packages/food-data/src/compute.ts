/**
 * The nutrition of one portion (ADR 0015) from its recipe: Σ (raw net grams × per 100 g × retention factor) + the fat
 * taken up in frying + the fat gained or lost by roasted, grilled, fried or braised meat — the stage-3 method for energy
 * and macronutrients (scripts/dish-data/lib.mjs, the same sums), extended to the whole nutrient vector. Pure: the build
 * uses it to write food-core, the recipes («нет дома» substitutions) will use it at run time.
 */
import { NUTRIENT_KEYS, NUTRIENTS, type NutrientKey, type NutrientVector } from './nutrients';
import {
  FRESH_IN_ASSEMBLED,
  retentionClass,
  retentionCode,
  type Heat,
  type RetentionClass,
} from './retention';

/** Energy of fat (kcal/g) for fat gained or lost in cooking (general Atwater factor; TR CU 022/2011 uses the same). */
export const FAT_KCAL_PER_G = 9;

/**
 * A nutrient of a dish is known when the ingredients that have it make up at least this share of the dish's
 * ingredient mass (drinking water left out); the missing rest then counts as 0 (a slight underestimate inside the
 * shown ±10–20 %). Below it, the dish value is null — «нет данных».
 */
export const COVERAGE_MIN = 0.97;

export type IngredientRecord = {
  /** `i_<fdcId>` for USDA SR Legacy foods, `ru:<slug>` for Russian label foods. */
  readonly id: string;
  readonly description: string;
  /** SR Legacy food_category_id; 0 for label foods. */
  readonly category: number;
  /** Per 100 g in NUTRIENTS order semantics (after the US fortification is taken out, ADR 0015). */
  readonly per100g: NutrientVector;
};

export type RecipeIngredient = { readonly id: string; readonly g: number };

export type Recipe = {
  /** Cooked portion as served; `ml` for drinks, `pieces` for counted items. */
  readonly portion: {
    readonly grams: number;
    readonly ml: number | null;
    readonly pieces: number | null;
  };
  readonly heat: Heat;
  /** Fresh vegetables, greens, fruit and cheese stay raw (salads, shawarma, burgers, poke…). */
  readonly assembled: boolean;
  /** More classes kept raw: the fish of sushi and poke. */
  readonly rawClasses?: readonly RetentionClass[];
  readonly ingredients: readonly RecipeIngredient[];
  /** Fat absorbed in frying: Bognár 2002 g per 100 g of the fried ready-to-cook ingredients. */
  readonly frying: {
    readonly oil: string;
    readonly fatGPer100g: number;
    /**
     * Only these ingredients are in the pan; null — all of them: the water of a dough, a batter or a juicy filling is
     * part of the food that is fried (the stage-3 numbers the game shows were computed so).
     */
    readonly fried: readonly string[] | null;
  } | null;
  /** Fat gained or lost by dry-heat or braised meat (USDA cooking yields), g per 100 g of the raw cut. */
  readonly meatFat: { readonly cut: string; readonly fatChangeGPer100gRaw: number } | null;
};

/** Retention factors by code: nutrient → percent retained. */
export type RetentionTable = Readonly<Record<string, Partial<Record<NutrientKey, number>>>>;

export type Computed = {
  /** Unrounded per-portion values. */
  readonly perPortion: NutrientVector;
  /** Share of the ingredient mass with a value, per nutrient (1 = complete). */
  readonly coverage: Readonly<Record<NutrientKey, number>>;
  /** The retention code applied to each ingredient (null — none). */
  readonly codes: Readonly<Record<string, string | null>>;
};

/** «Beverages, water, tap, drinking» — cooking water: its mass is left out of the coverage. */
export const WATER_ID = 'i_173647';

const RETAINED = new Set<NutrientKey>(NUTRIENTS.filter((n) => n.retention).map((n) => n.key));

export function computeRecipe(
  recipe: Recipe,
  ingredients: Readonly<Record<string, IngredientRecord>>,
  retention: RetentionTable,
): Computed {
  const lookup = (id: string): IngredientRecord => {
    const food = ingredients[id];
    if (!food) throw new Error(`unknown ingredient «${id}»`);
    return food;
  };
  const codes: Record<string, string | null> = {};
  const parts: { food: IngredientRecord; g: number; code: string | null }[] = [];
  for (const { id, g } of recipe.ingredients) {
    const food = lookup(id);
    const cls = retentionClass({
      description: food.description,
      category: food.category,
      fatG: food.per100g.fatG,
    });
    const raw =
      cls !== null &&
      ((recipe.assembled && FRESH_IN_ASSEMBLED.has(cls)) ||
        (recipe.rawClasses?.includes(cls) ?? false));
    const code = retentionCode(
      { description: food.description, category: food.category, fatG: food.per100g.fatG },
      recipe.heat,
      raw,
    );
    if (code !== null && !retention[code]) throw new Error(`no retention factors for code ${code}`);
    codes[id] = code;
    parts.push({ food, g, code });
  }
  if (recipe.frying) {
    const { oil, fatGPer100g, fried } = recipe.frying;
    const mass = recipe.ingredients
      .filter((item) => fried === null || fried.includes(item.id))
      .reduce((sum, item) => sum + item.g, 0);
    parts.push({ food: lookup(oil), g: (fatGPer100g * mass) / 100, code: null });
  }

  const sums = {} as Record<NutrientKey, number>;
  const coverage = {} as Record<NutrientKey, number>;
  for (const key of NUTRIENT_KEYS) {
    if (key === 'waterG') continue;
    let sum = 0;
    let known = 0;
    let total = 0;
    for (const { food, g, code } of parts) {
      const counts = food.id !== WATER_ID;
      if (counts) total += g;
      const value = food.per100g[key];
      if (value === null) continue;
      if (counts) known += g;
      const factor = code !== null && RETAINED.has(key) ? (retention[code]?.[key] ?? 100) / 100 : 1;
      sum += (value * g * factor) / 100;
    }
    sums[key] = sum;
    coverage[key] = total === 0 ? 1 : known / total;
  }

  // Meat fried in oil takes up fat by Bognár's table; the USDA dry-heat fat change is for meat cooked without frying
  // oil — both at once would count the fat twice (stage 3).
  let fatChange = 0;
  const meat = recipe.frying ? null : recipe.meatFat;
  if (meat) {
    const raw = recipe.ingredients.filter((i) => i.id === meat.cut).reduce((s, i) => s + i.g, 0);
    if (raw === 0) throw new Error(`the cut «${meat.cut}» is not an ingredient`);
    fatChange = (meat.fatChangeGPer100gRaw * raw) / 100;
    const cut = lookup(meat.cut).per100g;
    sums.fatG += fatChange;
    sums.energyKcal += fatChange * FAT_KCAL_PER_G;
    if (cut.fatG && cut.satFatG !== null) sums.satFatG += (fatChange * cut.satFatG) / cut.fatG;
  }

  const perPortion = {} as NutrientVector;
  for (const key of NUTRIENT_KEYS) {
    if (key === 'waterG') continue;
    perPortion[key] = coverage[key] >= COVERAGE_MIN ? sums[key] : null;
  }
  // Water of the cooked portion = its weight − the dry matter (evaporation and absorbed cooking water included).
  let solids = fatChange;
  let waterKnown = true;
  for (const { food, g } of parts) {
    const water = food.per100g.waterG;
    if (water === null) {
      waterKnown = false;
      break;
    }
    solids += (g * (100 - water)) / 100;
  }
  perPortion.waterG = waterKnown ? Math.max(0, recipe.portion.grams - solids) : null;
  coverage.waterG = waterKnown ? 1 : 0;
  return { perPortion, coverage, codes };
}

export type Problem = string;

/** Plausible ranges per 100 g of a ready dish or drink (outliers are reviewed, not silently kept). */
export const PER_100G_MAX: Partial<Record<NutrientKey, number>> = {
  energyKcal: 700,
  proteinG: 50,
  fatG: 75,
  carbsG: 90,
  fibreG: 30,
  sodiumMg: 2500,
  potassiumMg: 2000,
  calciumMg: 1300,
  ironMg: 15,
  vitaminCMg: 120,
  vitaminAUg: 3000,
  caffeineMg: 250,
};

/**
 * Checks of one computed portion: energy agrees with 4 P + 9 F + 4 C + 2 fibre (TR CU 022/2011) within max(12 %,
 * 15 kcal); per-100 g values stay in plausible ranges; sugars fit inside carbohydrate; added ≤ total sugars; water fits
 * inside the portion.
 */
export function checkPortion(v: NutrientVector, grams: number): Problem[] {
  const problems: Problem[] = [];
  const { energyKcal: e, proteinG: p, fatG: f, carbsG: c, fibreG: fibre } = v;
  if (e !== null && p !== null && f !== null && c !== null) {
    const atwater = 4 * p + 9 * f + 4 * c + 2 * (fibre ?? 0);
    if (Math.abs(atwater - e) > Math.max(0.12 * e, 15))
      problems.push(`energy ${e.toFixed(0)} kcal vs 4P+9F+4C+2fibre ${atwater.toFixed(0)} kcal`);
  }
  for (const [key, max] of Object.entries(PER_100G_MAX) as [NutrientKey, number][]) {
    const value = v[key];
    if (value !== null && (value * 100) / grams > max)
      problems.push(`${key} ${((value * 100) / grams).toFixed(1)} per 100 g > ${max}`);
  }
  if (v.sugarsG !== null && c !== null && v.sugarsG > c + 0.5)
    problems.push('sugars > carbohydrate');
  if (v.addedSugarsG !== null && v.sugarsG !== null && v.addedSugarsG > v.sugarsG + 0.5)
    problems.push('added sugars > total sugars');
  if (v.satFatG !== null && f !== null && v.satFatG > f + 0.1) problems.push('saturated fat > fat');
  if (v.waterG !== null && v.waterG > grams) problems.push('water > portion');
  if (v.waterG !== null && v.waterG === 0)
    problems.push('no water left: portion lighter than its dry matter');
  return problems;
}
