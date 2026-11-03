/**
 * Assembles the browser chunks from the committed sources (ADR 0015). Pure: the build writes its result, and the
 * tests recompute it from the repository and compare it with the committed files.
 */
import { ALLERGEN_CODES, type AllergenCode } from '@refectorio/nutrition-core';
import { dietFlags, type Catalog, type Dish, type DishTextFile } from '@refectorio/taste-core';
import { ingredientAllergens, ingredientAnimal, ingredientTraces } from './allergens';
import {
  checkPortion,
  computeRecipe,
  type IngredientRecord,
  type Recipe,
  type RetentionTable,
} from './compute';
import { fromArray, NUTRIENT_KEYS, roundVector, toArray, type NutrientKey } from './nutrients';
import { retentionClass, type RetentionClass } from './retention';
import {
  ITEM_FLAGS,
  type FishMercury,
  type FoodCoreFile,
  type FoodCoreItem,
  type FoodTextFile,
  type ItemFlag,
  type ItemsFile,
  type Role,
} from './schema';
import type {
  IngredientsFile,
  RecipeSource,
  RecipesFile,
  RetentionFile,
  TextsFile,
} from './sources';

export type AssembleInput = {
  readonly version: string;
  readonly catalog: Catalog;
  readonly dishText: DishTextFile;
  readonly items: ItemsFile;
  readonly ingredients: IngredientsFile;
  readonly retention: RetentionFile;
  readonly recipes: RecipesFile;
  readonly texts: TextsFile;
};

export type ItemDetails = {
  readonly id: string;
  readonly codes: Readonly<Record<string, string | null>>;
  readonly coverage: Readonly<Record<NutrientKey, number>>;
  readonly derivedAllergens: readonly AllergenCode[];
};

export type AssembleOutput = {
  readonly core: FoodCoreFile;
  readonly text: FoodTextFile;
  /** Everything that must be fixed before the data ships (the tests require none). */
  readonly problems: readonly string[];
  /** Facts for the build report: allergens declared but not in the recipe, unknown fish classes. */
  readonly notes: readonly string[];
  readonly details: readonly ItemDetails[];
};

const ROLE_BY_COURSE: Readonly<Record<Dish['course'], Role>> = {
  breakfast: 'main',
  soup: 'soup',
  salad: 'salad',
  main: 'main',
  side: 'side',
  baking: 'snack',
  dessert: 'dessert',
  snack: 'snack',
};

/**
 * FDA/EPA «Advice about eating fish» (revised October 2021, the text table opened 02.11.2026): the worst class wins.
 * Surimi is made from pollock and whiting (best). Species the list does not name (walleye, mussels, octopus) stay
 * unclassified.
 */
const MERCURY: readonly (readonly [FishMercury, RegExp])[] = [
  [
    'avoid',
    /mackerel, king|marlin|orange roughy|shark|swordfish|tuna, (fresh, )?bigeye|tilefish.*gulf/,
  ],
  [
    'good',
    /bluefish|buffalofish|\bcarp\b|toothfish|grouper|halibut|mahimahi|dolphinfish|monkfish|rockfish|sablefish|sheepshead|snapper|mackerel, spanish|striped bass|tilefish|tuna, (fresh, )?(yellowfin|albacore|white)|weakfish|seatrout|croaker, (white|pacific)/,
  ],
  [
    'best',
    /anchov|croaker|mackerel, (atlantic|pacific)|sea bass|butterfish|catfish|clam|\bcod\b|crab|crayfish|crawfish|flounder|haddock|hake|herring|lobster|mullet|oyster|perch|pickerel|plaice|pollock|salmon|sardine|scallop|\bshad\b|shrimp|skate|smelt|\bsole\b|squid|tilapia|trout|tuna, light|skipjack|whitefish|whiting|surimi/,
  ],
];
const MERCURY_ORDER: readonly FishMercury[] = ['best', 'good', 'avoid'];
const FISH_CLASSES = new Set<RetentionClass>(['fishLean', 'fishFat', 'shellfish']);
const CURED_FISH = /pickled|salted|smoked|kippered|cured|dried/;
const CURED_MEAT =
  /salt pork|salami|pepperoni|prosciutto|chorizo|summer sausage|cervelat|jamon|capicola|bresaola/;
const MOULD_CHEESE = /brie|camembert|cheese, blue|roquefort|gorgonzola|stilton/;
/** Not checked strictly against the catalog: no recipe ingredient names them reliably. */
const SOFT_ALLERGENS = new Set<AllergenCode>(['LUPIN', 'ASPARTAME']);

export function fishMercury(descriptions: readonly string[]): {
  hg: FishMercury | null;
  unknown: string[];
} {
  let worst = -1;
  const unknown: string[] = [];
  for (const d of descriptions.map((x) => x.toLowerCase())) {
    const hit = MERCURY.find(([, re]) => re.test(d));
    if (hit) worst = Math.max(worst, MERCURY_ORDER.indexOf(hit[0]));
    else unknown.push(d);
  }
  return { hg: worst >= 0 ? (MERCURY_ORDER[worst] ?? null) : null, unknown };
}

const sortAllergens = (codes: Iterable<AllergenCode>): AllergenCode[] => {
  const set = new Set(codes);
  return ALLERGEN_CODES.filter((c) => set.has(c));
};

export function assemble(input: AssembleInput): AssembleOutput {
  const { catalog, items, recipes, texts } = input;
  const problems: string[] = [];
  const notes: string[] = [];
  const details: ItemDetails[] = [];

  const ingredients: Record<string, IngredientRecord> = {};
  for (const [id, row] of Object.entries(input.ingredients.ingredients)) {
    ingredients[id] = {
      id,
      description: row.description,
      category: row.category,
      per100g: fromArray(row.per100g),
    };
  }
  const retention: RetentionTable = Object.fromEntries(
    Object.entries(input.retention.codes).map(([code, row]) => [code, row.factors]),
  );

  const toRecipe = (source: RecipeSource): Recipe => ({
    portion: source.portion,
    heat: source.heat,
    assembled: source.assembled,
    ...(source.rawClasses ? { rawClasses: source.rawClasses } : {}),
    ingredients: source.ingredients.map(([id, g]) => ({ id, g })),
    frying: source.frying
      ? {
          oil: source.frying.oil,
          fatGPer100g: source.frying.fatGPer100g,
          fried: source.frying.fried,
        }
      : null,
    meatFat: source.meatFat
      ? { cut: source.meatFat.cut, fatChangeGPer100gRaw: source.meatFat.fatChangeGPer100gRaw }
      : null,
  });

  type Draft = Omit<FoodCoreItem, 'i'> & { ingredients: readonly (readonly [string, number])[] };
  const drafts: Draft[] = [];
  const textItems: Record<string, [string, string, string, string]> = {};

  const build = (
    id: string,
    base: {
      role: Role;
      mealTypes: FoodCoreItem['m'];
      cookMin: number | undefined;
      boxable: boolean;
    },
    declared: {
      allergens: readonly AllergenCode[] | null;
      servingAllergens: readonly AllergenCode[];
    },
    facts: {
      rawFish?: boolean | undefined;
      rawEgg?: boolean | undefined;
      curedFish?: boolean | undefined;
      unpasteurised?: boolean | undefined;
    },
    diet: ReturnType<typeof dietFlags> | null,
    taste: FoodCoreItem['x'],
  ): RecipeSource | null => {
    const source = recipes.recipes[id];
    if (!source) {
      problems.push(`${id}: no recipe`);
      return null;
    }
    let computed;
    try {
      computed = computeRecipe(toRecipe(source), ingredients, retention);
    } catch (error) {
      problems.push(`${id}: ${(error as Error).message}`);
      return null;
    }
    const perPortion = roundVector(computed.perPortion);
    for (const p of checkPortion(perPortion, source.portion.grams)) problems.push(`${id}: ${p}`);
    const cookMin = base.cookMin ?? source.cookMin;
    if (cookMin === undefined) problems.push(`${id}: no cooking time`);

    const foods = source.ingredients
      .map(([ingredientId]) => ingredients[ingredientId])
      .filter((f) => f !== undefined);
    const derived = sortAllergens(foods.flatMap((f) => ingredientAllergens(f)));
    const animal = foods.map((f) => ingredientAnimal(f));
    const meat = animal.some((a) => a.meat);
    const fish = animal.some((a) => a.fish);
    const gelatin = animal.some((a) => a.gelatin);
    const fromIngredients = {
      vegetarian: !meat && !fish && !gelatin,
      vegan: !meat && !fish && !gelatin && !animal.some((a) => a.dairy || a.egg || a.honey),
      pescatarian: !meat && !gelatin,
    };
    if (diet) {
      for (const key of ['vegetarian', 'vegan', 'pescatarian'] as const) {
        if (diet[key] && !fromIngredients[key])
          problems.push(`${id}: catalog says ${key}, the recipe is not`);
      }
    }
    let allergens: AllergenCode[];
    if (declared.allergens) {
      allergens = [...declared.allergens];
      const known = new Set([...declared.allergens, ...declared.servingAllergens]);
      for (const code of derived) {
        if (known.has(code)) continue;
        const from = foods.find((f) => ingredientAllergens(f).includes(code))?.description ?? '?';
        (SOFT_ALLERGENS.has(code) ? notes : problems).push(
          `${id}: ${code} from «${from}» is not declared`,
        );
      }
      for (const code of declared.allergens) {
        if (!derived.includes(code))
          notes.push(`${id}: declared ${code}, not in the recipe ingredients`);
      }
    } else {
      allergens = derived;
    }
    const contained = new Set(allergens);
    const traces = sortAllergens(
      foods.flatMap((f) => ingredientTraces(f)).filter((code) => !contained.has(code)),
    );

    const classes = foods.map((f) =>
      retentionClass({ description: f.description, category: f.category, fatG: f.per100g.fatG }),
    );
    // Fish and seafood as food (SR group 15); fish sauce is a seasoning, not a serving of fish.
    const fishFoods = foods.filter((f, k) => {
      const cls = classes[k];
      return f.category === 15 || (cls !== null && cls !== undefined && FISH_CLASSES.has(cls));
    });
    const mercury = fishMercury(fishFoods.map((f) => f.description));
    if (fishFoods.length > 0 && mercury.unknown.length > 0)
      notes.push(`${id}: no FDA mercury class for ${mercury.unknown.join('; ')}`);
    const rawFish =
      facts.rawFish ??
      (source.rawClasses?.some((c) => FISH_CLASSES.has(c)) === true && fishFoods.length > 0);
    const rawEgg = facts.rawEgg ?? (source.heat === 'none' && classes.includes('eggs'));
    // Cured, smoked and mould-ripened foods are a risk only when the dish does not cook them (eaten cold or assembled).
    const uncooked = source.heat === 'none' || source.assembled;
    const curedFish =
      facts.curedFish ??
      (uncooked && fishFoods.some((f) => CURED_FISH.test(f.description.toLowerCase())));
    const curedMeat = uncooked && foods.some((f) => CURED_MEAT.test(f.description.toLowerCase()));
    const mouldCheese =
      uncooked && foods.some((f) => MOULD_CHEESE.test(f.description.toLowerCase()));
    const flags = new Set<ItemFlag>();
    if (diet !== null) flags.add('inGame');
    if (base.boxable) flags.add('boxable');
    const dietOut = diet ?? fromIngredients;
    if (dietOut.vegetarian) flags.add('vegetarian');
    if (dietOut.vegan) flags.add('vegan');
    if (dietOut.pescatarian) flags.add('pescatarian');
    if (rawFish) flags.add('rawFish');
    if (rawEgg) flags.add('rawEgg');
    if (facts.unpasteurised) flags.add('unpasteurised');
    if (curedFish) flags.add('curedFish');
    if (curedMeat) flags.add('curedMeat');
    if (mouldCheese) flags.add('mouldCheese');
    if (foods.some((f) => [5, 10, 13, 17].includes(f.category) && /liver/i.test(f.description)))
      flags.add('liver');
    if (foods.some((f) => /^alcoholic beverage/i.test(f.description))) flags.add('alcohol');

    drafts.push({
      id,
      r: base.role,
      m: base.mealTypes,
      a: allergens,
      sa: sortAllergens(declared.servingAllergens),
      tr: traces,
      f: ITEM_FLAGS.filter((flag) => flags.has(flag)),
      hg: mercury.hg,
      p: [source.portion.grams, source.portion.ml, source.portion.pieces],
      t: cookMin ?? 0,
      n: toArray(perPortion),
      ingredients: source.ingredients,
      ...(taste ? { x: taste } : {}),
    });
    details.push({
      id,
      codes: computed.codes,
      coverage: computed.coverage,
      derivedAllergens: derived,
    });
    return source;
  };

  for (const dish of catalog.dishes) {
    const facts = items.game[dish.id];
    if (!facts) {
      problems.push(`${dish.id}: no menu facts`);
      continue;
    }
    const source = build(
      dish.id,
      {
        role: facts.role ?? ROLE_BY_COURSE[dish.course],
        mealTypes: dish.mealTypes,
        cookMin: facts.cookMin,
        boxable: facts.boxable ?? true,
      },
      { allergens: dish.allergens, servingAllergens: facts.servingAllergens ?? [] },
      facts,
      dietFlags(dish),
      undefined,
    );
    const text = input.dishText.dishes[dish.id];
    if (!text) problems.push(`${dish.id}: no description`);
    textItems[dish.id] = [dish.nameRu, source?.whatRu ?? '', text?.[0] ?? '', text?.[1] ?? ''];
  }
  for (const [id, item] of Object.entries(items.menu).sort(([a], [b]) => a.localeCompare(b))) {
    if (catalog.dishes.some((d) => d.id === id)) problems.push(`${id}: also a game dish`);
    const source = build(
      id,
      { role: item.role, mealTypes: item.mealTypes, cookMin: item.cookMin, boxable: item.boxable },
      { allergens: null, servingAllergens: item.servingAllergens ?? [] },
      { unpasteurised: item.unpasteurised },
      null,
      item.taste,
    );
    const text = texts.items[id];
    if (!text) problems.push(`${id}: no description`);
    textItems[id] = [item.nameRu, source?.whatRu ?? '', text?.[0] ?? '', text?.[1] ?? ''];
  }
  for (const id of Object.keys(items.game)) {
    if (!catalog.dishes.some((d) => d.id === id))
      problems.push(`${id}: menu facts for a dish not in the catalog`);
  }

  // One ingredient table, ids in a stable order (sorted), so the item arrays are deterministic.
  const used = [...new Set(drafts.flatMap((d) => d.ingredients.map(([id]) => id)))].sort();
  const indexOf = new Map(used.map((id, i) => [id, i]));
  const core: FoodCoreFile = {
    version: input.version,
    catalogVersion: catalog.version,
    nutrients: [...NUTRIENT_KEYS],
    ingredients: used.map((id) => [id, input.ingredients.ingredients[id]?.nameRu ?? id]),
    items: drafts.map(({ ingredients: list, ...rest }) => ({
      ...rest,
      i: list.map(([id, g]) => [indexOf.get(id) ?? -1, g] as [number, number]),
    })),
  };
  return { core, text: { version: input.version, items: textItems }, problems, notes, details };
}
