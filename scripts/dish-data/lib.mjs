// Dish nutrition of the game cards (stage 3, §5.3; refectorio-workspace/research/stage-3-dish-data.md): energy and
// macronutrients per portion are computed here from the recipes and USDA SR Legacy — never written by hand or by a
// model («ИИ не считает цифры»). Pure functions; the CLI scripts next to this file read and write the data.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(APP_ROOT, 'packages', 'taste-core', 'data');
export const FOOD_DIR = path.join(DATA_DIR, 'food');
export const RECIPES_FILE = path.join(FOOD_DIR, 'recipes.json');
export const INGREDIENTS_FILE = path.join(FOOD_DIR, 'ingredients.json');
export const COOKING_FILE = path.join(FOOD_DIR, 'cooking.json');
export const NUTRITION_FILE = path.join(DATA_DIR, 'dish-nutrition.json');
export const NUMBERS_FILE = path.join(DATA_DIR, 'dish-numbers.json');
/** The USDA archive is unpacked here (not in git): `npm run dish-data:usda` explains where it comes from. */
export const USDA_DIR = path.join(APP_ROOT, '.cache', 'usda');

/** FoodData Central nutrient ids (nutrient.csv). */
export const NUTRIENT_IDS = {
  energyKcal: 1008,
  proteinG: 1003,
  fatG: 1004,
  carbsByDifferenceG: 1005,
  fibreG: 1079,
};

/** Energy of fat (kcal/g) for fat gained or lost in cooking (general Atwater factor; TR CU 022/2011 uses the same). */
export const FAT_KCAL_PER_G = 9;

/** A small RFC 4180 reader: quoted fields, doubled quotes, CRLF. Returns rows of strings. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows with a header → objects. */
export function records(text) {
  const [header, ...rows] = parseCsv(text);
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ''])));
}

/**
 * SR Legacy foods: fdc_id → { description, per100g }. Carbohydrate is stored as available carbohydrate (by difference
 * minus dietary fibre, §5.3) with the fibre kept; a nutrient the food does not list is null.
 */
export function srLegacyFoods(foodCsv, foodNutrientCsv) {
  const wanted = new Map(Object.entries(NUTRIENT_IDS).map(([name, id]) => [String(id), name]));
  const values = new Map();
  for (const row of records(foodNutrientCsv)) {
    const name = wanted.get(row.nutrient_id);
    if (!name) continue;
    const id = Number(row.fdc_id);
    const food = values.get(id) ?? {};
    food[name] = Number(row.amount);
    values.set(id, food);
  }
  const foods = new Map();
  for (const row of records(foodCsv)) {
    const id = Number(row.fdc_id);
    const v = values.get(id) ?? {};
    const fibre = v.fibreG ?? 0;
    foods.set(id, {
      fdcId: id,
      description: row.description,
      per100g: {
        energyKcal: v.energyKcal ?? null,
        proteinG: v.proteinG ?? null,
        fatG: v.fatG ?? null,
        carbsG:
          v.carbsByDifferenceG === undefined ? null : Math.max(0, v.carbsByDifferenceG - fibre),
        fibreG: v.fibreG ?? null,
      },
    });
  }
  return foods;
}

/** Exact description lookup (case and spaces do not matter). */
export function byDescription(foods) {
  const index = new Map();
  for (const food of foods.values()) index.set(normalize(food.description), food);
  return (description) => index.get(normalize(description)) ?? null;
}

const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const ZERO = { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0, fibreG: 0 };
const KEYS = Object.keys(ZERO);

function add(total, per100g, grams, label) {
  for (const key of KEYS) {
    const value = per100g[key];
    if (value === null || value === undefined) {
      // Missing fibre is common for meat and fish (none there); anything else must be present.
      if (key === 'fibreG') continue;
      throw new Error(`${label}: no ${key}`);
    }
    total[key] += (value * grams) / 100;
  }
}

/**
 * One portion of a dish: Σ (raw net ingredient grams × per 100 g) + the fat taken up in frying (Bognár 2002, g per
 * 100 g of the fried ready-to-cook ingredients) + the fat gained or lost by roasted, grilled, fried or braised meat
 * (USDA cooking yields table, g per 100 g raw). Returns unrounded values and the parts for the report.
 */
export function computeDish(recipe, { ingredients, cooking }) {
  const total = { ...ZERO };
  const parts = [];
  for (const item of recipe.ingredients) {
    const food = ingredients[item.key];
    if (!food) throw new Error(`unknown ingredient «${item.key}»`);
    add(total, food.per100g, item.g, item.key);
    parts.push({ key: item.key, g: item.g });
  }
  const frying = recipe.cooking?.frying;
  if (frying) {
    const row = cooking.frying[frying.category];
    const uptake = row?.[frying.type]?.fatGPer100g;
    if (uptake === undefined)
      throw new Error(`no frying uptake for ${frying.category}/${frying.type}`);
    const fried = recipe.ingredients
      .filter((item) => (frying.fried ? frying.fried.includes(item.key) : item.key !== 'Water'))
      .reduce((sum, item) => sum + item.g, 0);
    const absorbed = (uptake * fried) / 100;
    const oil = ingredients[frying.oil];
    if (!oil) throw new Error(`unknown frying oil «${frying.oil}»`);
    add(total, oil.per100g, absorbed, frying.oil);
    parts.push({ key: `${frying.oil} (absorbed)`, g: absorbed });
  }
  // Meat fried in oil takes up fat by Bognár's table above; the USDA dry-heat fat change is for meat cooked without
  // frying oil — both at once would count the fat twice.
  const meat = frying ? null : recipe.cooking?.roastedMeat;
  if (meat) {
    const row = cooking.meat[meat.row];
    if (!row) throw new Error(`no meat fat row «${meat.row}»`);
    const raw = recipe.ingredients
      .filter((item) => item.key === meat.cut)
      .reduce((sum, item) => sum + item.g, 0);
    if (raw === 0) throw new Error(`the cut «${meat.cut}» is not an ingredient`);
    const change = ((row.fatChangeGPer100gRaw ?? 0) * raw) / 100;
    total.fatG += change;
    total.energyKcal += change * FAT_KCAL_PER_G;
    parts.push({ key: `fat ${change >= 0 ? 'gained' : 'lost'} by ${meat.cut}`, g: change });
  }
  return { ...total, parts };
}

/** kcal integer; grams to 0.1 (the card shows «8,4 г»). */
export function rounded(values) {
  const tenth = (value) => Math.round(Math.max(0, value) * 10) / 10;
  return {
    energyKcal: Math.round(Math.max(0, values.energyKcal)),
    proteinG: tenth(values.proteinG),
    fatG: tenth(values.fatG),
    carbsG: tenth(values.carbsG),
    fibreG: tenth(values.fibreG),
  };
}

/** Plausible cooked portion weights by course (g): outside them the recipe is looked at again. */
export const PORTION_RANGE = {
  breakfast: [80, 450],
  soup: [200, 450],
  salad: [80, 350],
  main: [100, 550],
  side: [80, 350],
  baking: [40, 300],
  dessert: [40, 300],
  snack: [20, 300],
  drink: [100, 400],
};

/**
 * Checks of one computed dish: the energy agrees with 4 P + 9 F + 4 C + 2 fibre (TR CU 022/2011) within
 * max(12 %, 15 kcal); the portion weight is plausible for its course; nothing is negative.
 */
export function checkDish(values, portionGrams, course) {
  const problems = [];
  const atwater = 4 * values.proteinG + 9 * values.fatG + 4 * values.carbsG + 2 * values.fibreG;
  const tolerance = Math.max(0.12 * values.energyKcal, 15);
  if (Math.abs(atwater - values.energyKcal) > tolerance) {
    problems.push(
      `energy ${values.energyKcal.toFixed(0)} kcal vs 4P+9F+4C+2fibre ${atwater.toFixed(0)} kcal`,
    );
  }
  const range = PORTION_RANGE[course];
  if (range && (portionGrams < range[0] || portionGrams > range[1])) {
    problems.push(`portion ${portionGrams} g outside ${range[0]}–${range[1]} g for ${course}`);
  }
  for (const key of KEYS) if (values[key] < 0) problems.push(`${key} negative`);
  return problems;
}

/** Text that was UTF-8 read as Windows-1251 («СЏР№С†Рѕ» → «яйцо»); anything else is returned as it is. */
export function repairMojibake(text) {
  if (!/[РС][\u0080-џ]/u.test(text)) return text;
  const bytes = [];
  for (const char of text) {
    const byte = CP1251.indexOf(char);
    if (byte === -1) return text;
    bytes.push(byte);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return text;
  }
}

// Windows-1251: bytes 0x00–0x7F are ASCII; 0x80–0xFF map to these characters.
const CP1251_HIGH =
  'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕїАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя';
const CP1251 = [...Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)), ...CP1251_HIGH];
