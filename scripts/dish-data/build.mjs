// Dish nutrition (stage 3, §5.3): recipes (refectorio-workspace research, ≥ 2 fetched recipes per dish) × USDA SR Legacy
// (+ Russian foods from their labels) → energy and macronutrients per standard portion. Run: `npm run dish-data`
// (needs the USDA archive unpacked in .cache/usda — see the error message). The AI never writes these numbers.
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  APP_ROOT,
  byDescription,
  checkDish,
  computeDish,
  FOOD_DIR,
  NUMBERS_FILE,
  NUTRITION_FILE,
  repairMojibake,
  rounded,
  srLegacyFoods,
  USDA_DIR,
} from './lib.mjs';

const RESEARCH = path.join(APP_ROOT, '..', 'refectorio-workspace', 'research', 'stage-3-dish-data');
const TODAY = new Date().toISOString().slice(0, 10);

/** Recipe names → the USDA description used (where the recipe's name is not one exactly), or a Russian food below. */
const ALIASES = {
  'Apples, raw, with skin':
    "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
  'Beef, loin, tenderloin steak, separable lean and fat, trimmed to 1/8" fat, choice, raw':
    'Beef, loin, tenderloin steak, boneless, separable lean and fat, trimmed to 0" fat, choice, raw',
  'Beef, rib eye steak, boneless, lip off, separable lean and fat, trimmed to 1/8" fat, choice, raw':
    'Beef, rib eye steak/roast, boneless, lip-on, separable lean and fat, trimmed to 1/8" fat, all grades, raw',
  'Beef, shank crosscuts, separable lean and fat, raw':
    'Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, raw',
  'Beer, regular, all': 'Alcoholic beverage, beer, regular, all',
  'Bread crumbs, dry, grated, plain': 'Bread, crumbs, dry, grated, plain',
  'Bread, white, commercially prepared':
    'Bread, white, commercially prepared (includes soft bread crumbs)',
  'Cheese, american, pasteurized process':
    'Cheese, pasteurized process, American, fortified with vitamin D',
  'Cheese, cheddar': "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)",
  'Chicken, broilers or fryers, breast, meat only, raw':
    'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw',
  'Chicken, broilers or fryers, thigh, meat only, raw':
    'Chicken, broilers or fryers, dark meat, thigh, meat only, raw',
  'Cream 10% fat (Russian slivki)': 'Cream, fluid, half and half',
  'Crustaceans, shrimp, mixed species, raw': 'Crustaceans, shrimp, raw',
  'Fish, pollock, walleye, raw': 'Fish, pollock, Alaska, raw',
  'Garlic powder': 'Spices, garlic powder',
  'Onion powder': 'Spices, onion powder',
  'Lamb, domestic, shoulder, whole (arm and blade), separable lean and fat, trimmed to 1/4" fat, choice, raw':
    'Lamb, shoulder, whole (arm and blade), separable lean and fat, trimmed to 1/4" fat, choice, raw',
  'Mayonnaise, regular': 'Salad dressing, mayonnaise, regular',
  'Milk, reduced fat, fluid, 2% milkfat':
    'Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and vitamin D',
  'Mirin (sweet rice wine for cooking)': 'Alcoholic beverage, rice (sake)',
  'Oil, sunflower, linoleic': 'Oil, sunflower, linoleic, (approx. 65%)',
  'Onions, red, raw': 'Onions, raw',
  'Peas, green, canned, regular pack, drained solids':
    'Peas, green, canned, no salt added, drained solids',
  'Rice, white, short-grain, raw, enriched': 'Rice, white, short-grain, raw, unenriched',
  'Sausage, smoked, semi-dry (servelat type)': 'Thuringer, cervelat, summer sausage, beef, pork',
  'Smetana 20% fat (Russian sour cream)': 'Cream, sour, cultured',
  'Sour cream (smetana) 20% fat': 'Cream, sour, cultured',
  'Sour cream 20% fat (smetana)': 'Cream, sour, cultured',
  'Sugar, granulated': 'Sugars, granulated',
  'Tomato products, canned, paste, without salt added':
    "Tomato products, canned, paste, without salt added (Includes foods for USDA's Food Distribution Program)",
  'Tvorog 5% fat (Russian cottage cheese)': 'Cheese, cottage, creamed, large or small curd',
  Water: 'Beverages, water, tap, drinking',
  'Yogurt, plain, low fat, 12 grams protein per 8 ounce': 'Yogurt, plain, low fat',
  'Mayonnaise 67% fat (Provencal)': 'ru:mayonnaise-67',
  'Mayonnaise 67% fat (Russian provencal)': 'ru:mayonnaise-67',
  'Kefir 2.5% fat (Russian fermented milk)': 'ru:kefir-2.5',
  'Kvass (Russian bread drink)': 'ru:kvass',
};

/** Russian foods without a good USDA match: label values per 100 g, each with the page it was read from. */
const RU_FOODS = {
  'ru:mayonnaise-67': {
    nameRu: 'майонез 67 %',
    per100g: { energyKcal: 613, proteinG: 0.4, fatG: 67, carbsG: 2.1, fibreG: 0 },
    source: {
      url: 'https://world.openfoodfacts.org/api/v2/product/4600699503910.json',
      title: 'Open Food Facts: «Майонез 67 % Провансаль» (этикетка)',
      accessed: '2026-10-24',
    },
  },
  'ru:kefir-2.5': {
    nameRu: 'кефир 2,5 %',
    per100g: { energyKcal: 51, proteinG: 3.0, fatG: 2.5, carbsG: 4.1, fibreG: 0 },
    source: {
      url: 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=kefir+2.5&search_simple=1&action=process&json=1',
      title:
        'Open Food Facts: медиана этикеток 15 кефиров 2,5 % (49–55 ккал, белок 2,9–3,3, углеводы 3,5–4,8)',
      accessed: '2026-10-24',
    },
  },
  'ru:kvass': {
    nameRu: 'квас хлебный',
    per100g: { energyKcal: 24, proteinG: 0, fatG: 0, carbsG: 6, fibreG: 0 },
    source: {
      url: 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=%D0%BA%D0%B2%D0%B0%D1%81&search_simple=1&action=process&json=1',
      title: 'Open Food Facts: «Очаково» квас (4600068009043), этикетка',
      accessed: '2026-10-24',
    },
  },
};

/** How much fat frying adds (Bognár 2002 groups, research/cooking-and-ru-dairy.json) — per dish. */
const FRYING = {
  d_syrniki: 'pancakes_blini_crepes',
  d_oladyi: 'pancakes_blini_crepes',
  d_blini: 'pancakes_blini_crepes',
  d_pancakes: 'pancakes_blini_crepes',
  d_omelette: 'eggs_scrambled_omelette',
  d_fried_eggs: 'eggs_fried',
  d_beef_stroganoff: 'whole_meat_poultry_fish_unbreaded',
  d_goulash: 'whole_meat_poultry_fish_unbreaded',
  d_tefteli: 'meat_patties_cutlets_unbreaded',
  d_kotlety: 'breaded_minced_meat',
  d_pork_chop: 'breaded_pieces_meat_poultry_fish',
  d_chicken_kiev: 'breaded_pieces_meat_poultry_fish',
  d_chicken_wings: 'whole_meat_poultry_fish_unbreaded',
  d_chicken_teriyaki: 'whole_meat_poultry_fish_unbreaded',
  d_chicken_schnitzel: 'breaded_pieces_meat_poultry_fish',
  d_fried_pollock: 'breaded_pieces_meat_poultry_fish',
  d_fish_cakes: 'breaded_minced_meat',
  d_fish_and_chips: 'breaded_pieces_meat_poultry_fish',
  d_tuna_steak: 'whole_meat_poultry_fish_unbreaded',
  d_marinated_fish: 'breaded_pieces_meat_poultry_fish',
  d_fried_calamari: 'breaded_pieces_meat_poultry_fish',
  d_shrimp_tempura: 'breaded_pieces_meat_poultry_fish',
  d_crab_cakes: 'breaded_minced_meat',
  d_draniki: 'potatoes_raw_pan_fried',
  d_fried_potatoes_mushrooms: 'potatoes_raw_pan_fried',
  d_french_fries: 'potatoes_french_fries_deep',
  d_chebureki: 'fried_dough_doughnuts_pies_chebureki',
  d_meat_pirozhki: 'fried_dough_doughnuts_pies_chebureki',
  d_spring_rolls: 'fried_dough_doughnuts_pies_chebureki',
};
/** Only these ingredients are in the pan (the rest is a sauce or a side that is not fried). */
const FRIED_ONLY = {
  d_beef_stroganoff: [
    'Beef, loin, tenderloin steak, boneless, separable lean and fat, trimmed to 0" fat, choice, raw',
  ],
  d_goulash: ['Beef, chuck, blade roast, separable lean and fat, trimmed to 1/8" fat, choice, raw'],
  d_marinated_fish: [
    'Fish, cod, Atlantic, raw',
    'Wheat flour, white, all-purpose, enriched, unbleached',
  ],
};

/** Fat gained or lost by dry-heat meat (USDA cooking yields rows) — cut keyword and method → row. */
function meatRow(cut, method) {
  const c = cut.toLowerCase();
  if (c.includes('beef, ground') && method !== 'braised') return 'beef-ground-80-20-patty-broiled';
  if (c.includes('rib eye') && (method === 'grilled' || method === 'roasted'))
    return 'beef-steak-rib-eye-boneless-grilled';
  if (c.startsWith('beef') && method === 'braised') return 'beef-chuck-arm-pot-roast-braised';
  if (c.startsWith('pork') && method === 'roasted') return 'pork-leg-ham-rump-roasted';
  if (c.includes('chicken') && c.includes('wing') && method === 'roasted')
    return 'chicken-wing-meat-skin-roasted';
  if (c.includes('chicken') && c.includes('skin') && method === 'roasted')
    return 'chicken-thigh-meat-skin-enhanced-roasted';
  return null;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main() {
  if (!existsSync(path.join(USDA_DIR, 'food.csv'))) {
    throw new Error(
      `No USDA data in ${USDA_DIR}: download FoodData_Central_sr_legacy_food_csv_2018-04.zip from ` +
        'https://fdc.nal.usda.gov/download-datasets and unpack food.csv and food_nutrient.csv there.',
    );
  }
  const foods = srLegacyFoods(
    await readFile(path.join(USDA_DIR, 'food.csv'), 'utf8'),
    await readFile(path.join(USDA_DIR, 'food_nutrient.csv'), 'utf8'),
  );
  const find = byDescription(foods);
  const research = await readJson(path.join(RESEARCH, 'cooking-and-ru-dairy.json'));
  const cooking = { frying: research.frying, meat: research.meatFatRetention };
  const catalog = await readJson(
    path.join(APP_ROOT, 'packages', 'taste-core', 'data', 'catalog.json'),
  );
  const courseOf = Object.fromEntries(catalog.dishes.map((d) => [d.id, d.course]));

  // Recipes of every batch collected so far.
  const recipes = {};
  for (const file of (await readdir(RESEARCH))
    .filter((f) => /^batch-\d+-recipes\.json$/.test(f))
    .sort()) {
    const batch = await readJson(path.join(RESEARCH, file));
    Object.assign(recipes, batch.dishes);
  }

  const ingredients = { ...RU_FOODS };
  const keyOf = (en) => {
    const alias = ALIASES[en] ?? en;
    if (alias.startsWith('ru:')) return RU_FOODS[alias] ? alias : null;
    const food = find(alias);
    if (!food) return null;
    ingredients[food.description] ??= {
      fdcId: food.fdcId,
      description: food.description,
      per100g: food.per100g,
    };
    return food.description;
  };

  const out = {};
  const numbers = {};
  const skipped = [];
  const problems = [];
  for (const [id, recipe] of Object.entries(recipes).sort(([a], [b]) => a.localeCompare(b))) {
    const missing = [];
    const items = recipe.ingredients.map((item) => {
      const key = keyOf(item.en);
      if (!key) missing.push(item.en);
      return { key, g: item.g, ru: repairMojibake(item.ru ?? '') };
    });
    const fry = recipe.cooking?.frying;
    const oil = fry ? keyOf(fry.oil) : null;
    if (fry && !oil) missing.push(fry.oil);
    if (missing.length > 0) {
      skipped.push(`${id}: ${missing.join('; ')}`);
      continue;
    }
    const roasted = recipe.cooking?.roastedMeat;
    const cut = roasted ? keyOf(roasted.cut) : null;
    const row = roasted && cut ? meatRow(roasted.cut, roasted.method) : null;
    const prepared = {
      ingredients: items,
      cooking: {
        frying: fry
          ? {
              type: fry.type,
              oil,
              category: FRYING[id] ?? 'whole_meat_poultry_fish_unbreaded',
              fried: FRIED_ONLY[id],
            }
          : null,
        roastedMeat: row ? { cut, row } : null,
      },
    };
    let values;
    try {
      values = computeDish(prepared, { ingredients, cooking });
    } catch (error) {
      skipped.push(`${id}: ${error.message}`);
      continue;
    }
    const portion = recipe.portion?.grams ?? 0;
    const result = rounded(values);
    for (const problem of checkDish(result, portion, courseOf[id]))
      problems.push(`${id}: ${problem}`);
    out[id] = {
      portion: {
        grams: portion,
        pieces: recipe.portion?.pieces ?? null,
        what: repairMojibake(recipe.portion?.what ?? ''),
      },
      perPortion: result,
      method: recipe.method,
      sources: (recipe.sources ?? []).map((s) => s.url),
      ingredients: items.map(({ key, g }) => ({ key, g })),
      cooking: prepared.cooking,
    };
    numbers[id] = [result.energyKcal, result.proteinG, result.fatG, result.carbsG];
  }

  await writeFile(
    path.join(FOOD_DIR, 'ingredients.json'),
    `${JSON.stringify({ version: TODAY, source: 'USDA FoodData Central SR Legacy (April 2018) + Russian labels', ingredients }, null, 2)}\n`,
  );
  await writeFile(
    NUTRITION_FILE,
    `${JSON.stringify({ version: TODAY, method: 'research/stage-3-dish-data.md', dishes: out }, null, 2)}\n`,
  );
  await writeFile(
    NUMBERS_FILE,
    `${JSON.stringify({ version: TODAY, dishes: numbers }, null, 2)}\n`,
  );
  console.log(`computed ${Object.keys(out).length}, skipped ${skipped.length}`);
  if (skipped.length) console.log(`skipped:\n  ${skipped.join('\n  ')}`);
  if (problems.length) console.log(`checks:\n  ${problems.join('\n  ')}`);
}

await main();
