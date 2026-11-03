/**
 * Fixtures for tests, the simulation and Kiki's evals: the committed food data and catalog, real taste profiles
 * from taste-core, valid quiz answers. Not used by the site.
 */
import {
  quizAnswersV1Schema,
  toQuestionnaireInput,
  type QuizAnswersV1,
  type TasteAnswer,
  type TasteProfileV1,
} from '@refectorio/contracts';
import foodCore from '@refectorio/food-data/data/food-core.json';
import foodText from '@refectorio/food-data/data/food-text.json';
import {
  activityFromLifestyle,
  evaluateGuardrails,
  validateQuestionnaire,
} from '@refectorio/nutrition-core';
import {
  applyAnswer,
  buildProfile,
  catalogSchema,
  createRandom,
  initialState,
  prepareCatalog,
  type Catalog,
  type Random,
} from '@refectorio/taste-core';
import catalogJson from '@refectorio/taste-core/data/catalog.json';
import { foodTextSchema } from '@refectorio/food-data';
import { buildFoodIndex, type FoodIndex } from './foods';

let cachedFoods: FoodIndex | null = null;
let cachedCatalog: Catalog | null = null;
let cachedPrepared: ReturnType<typeof prepareCatalog> | null = null;

export function testCatalog(): Catalog {
  cachedCatalog ??= catalogSchema.parse(catalogJson);
  return cachedCatalog;
}

export function testFoods(): FoodIndex {
  cachedFoods ??= buildFoodIndex({
    foodCore,
    catalog: testCatalog(),
    foodText: foodTextSchema.parse(foodText),
  });
  return cachedFoods;
}

/** A real taste profile: taste-core's posterior after these answers (the game's own update). */
export function tasteProfile(
  answers: readonly (readonly [string, TasteAnswer])[] = [],
): TasteProfileV1 {
  const catalog = testCatalog();
  cachedPrepared ??= prepareCatalog(catalog);
  const prepared = cachedPrepared;
  let state = initialState(prepared);
  for (const [dishId, answer] of answers) {
    const index = prepared.indexOf.get(dishId);
    if (index !== undefined) state = applyAnswer(prepared, state, index, answer);
  }
  return buildProfile({
    catalogVersion: catalog.version,
    seed: 1,
    dishes: prepared.dishes,
    vectors: prepared.vectors,
    space: prepared.space,
    posterior: state.posterior,
    decisions: state.decisions,
  });
}

let neutralTaste: TasteProfileV1 | null = null;

export type AnswersOverrides = Partial<Omit<QuizAnswersV1, 'guardrails' | 'version'>>;

/** Valid quiz answers (an office worker by default) with guardrails evaluated like the quiz does. */
export function quizAnswers(overrides: AnswersOverrides = {}): QuizAnswersV1 {
  neutralTaste ??= tasteProfile();
  const base: Omit<QuizAnswersV1, 'guardrails'> = {
    version: 1,
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:05:00.000Z',
    taste: neutralTaste,
    body: { sex: 'female', ageYears: 32, heightCm: 168, weightKg: 64, mode: 'self' },
    goal: { goal: 'maintain' },
    diet: 'omnivore',
    macroProfile: 'recommended',
    health: { flags: [], pregnancy: 'none', lactation: 'none', custom: [] },
    allergies: { items: [], custom: [] },
    activity: {
      exercise: '1to2',
      strengthTraining: false,
      lifestyle: 'mostlySitting',
      pal: 1.5,
      group: 'kfa2',
    },
    extraGoals: [],
    adjustments: [],
    ...overrides,
  };
  const input = validateQuestionnaire(toQuestionnaireInput(base));
  if (!input.ok) throw new Error(`quizAnswers: ${JSON.stringify(input.error)}`);
  return quizAnswersV1Schema.parse({ ...base, guardrails: evaluateGuardrails(input.value) });
}

const pick = <T>(rng: Random, list: readonly T[]): T => {
  const value = list[rng.int(list.length)];
  if (value === undefined) throw new Error('pick from an empty list');
  return value;
};

/** Random taste answers: a hidden liking for some cuisines and proteins, 15–30 decisive cards. */
function randomTaste(rng: Random): TasteProfileV1 {
  const catalog = testCatalog();
  const likedCuisines = new Set(
    catalog.dishes.map((d) => d.cuisine).filter(() => rng.next() < 0.3),
  );
  const dislikedProteins = new Set(
    ['beef', 'pork', 'fish', 'seafood', 'mushrooms', 'legumes'].filter(() => rng.next() < 0.15),
  );
  const answers: [string, TasteAnswer][] = [];
  const cards = 15 + rng.int(16);
  for (let i = 0; i < cards; i += 1) {
    const dish = pick(rng, catalog.dishes);
    const p =
      0.45 +
      (likedCuisines.has(dish.cuisine) ? 0.3 : 0) -
      (dish.proteins.some((x) => dislikedProteins.has(x)) ? 0.4 : 0);
    answers.push([dish.id, rng.next() < 0.08 ? 'skip' : rng.next() < p ? 'like' : 'dislike']);
  }
  return tasteProfile(answers);
}

const ALLERGENS = [
  'GLUTEN',
  'CRUSTACEAN',
  'MOLLUSC',
  'FISH',
  'EGG',
  'MILK',
  'TREE_NUT',
  'PEANUT',
  'SOY',
  'SESAME',
  'CELERY',
  'MUSTARD',
] as const;
const LEVELS = ['intolerance', 'allergy', 'severeAllergy'] as const;
const DISLIKES = [
  'грибы',
  'лук',
  'чеснок',
  'рыба',
  'кинза',
  'печень',
  'оливки',
  'баклажаны',
  'молочка',
  'острое',
  'свёкла',
  'капуста',
];

/**
 * A random valid person for the property tests and the simulation (ТЗ фаза 3 §10): adults and teenagers, every
 * diet of the quiz, allergies at all levels, health flags, pregnancy and lactation, extra goals, macro profiles.
 */
export function randomAnswers(seed: number): QuizAnswersV1 {
  const rng = createRandom(seed);
  const sex = rng.next() < 0.5 ? 'female' : 'male';
  const ageYears = rng.next() < 0.08 ? 14 + rng.int(4) : 18 + rng.int(rng.next() < 0.15 ? 72 : 47);
  const heightCm = sex === 'female' ? 150 + rng.int(36) : 160 + rng.int(36);
  const bmi = 17.5 + rng.next() * (rng.next() < 0.2 ? 22 : 12);
  const weightKg = Math.round(((bmi * heightCm * heightCm) / 10_000) * 10) / 10;
  const adult = ageYears >= 18;
  const pregnancy =
    sex === 'female' && adult && ageYears < 45 && rng.next() < 0.1
      ? pick(rng, ['trimester1', 'trimester2', 'trimester3'] as const)
      : 'none';
  const lactation =
    sex === 'female' && adult && ageYears < 45 && pregnancy === 'none' && rng.next() < 0.07
      ? pick(rng, ['months0to6', 'months7to12'] as const)
      : 'none';
  const goal =
    !adult || pregnancy !== 'none' || lactation !== 'none'
      ? 'maintain'
      : pick(rng, ['lose', 'gain', 'maintain'] as const);
  const targetWeightKg =
    goal === 'lose'
      ? Math.round(weightKg * 0.92 * 10) / 10
      : goal === 'gain'
        ? Math.round(weightKg * 1.05 * 10) / 10
        : undefined;
  const flags = [
    'diabetesType2',
    'hypertension',
    'hypothyroidism',
    'insulinResistance',
    'warfarin',
    'maoi',
    'eatingDisorderHistory',
  ] as const;
  const health = adult ? flags.filter(() => rng.next() < 0.05) : [];
  const allergyCount = rng.next() < 0.3 ? 1 + rng.int(rng.next() < 0.2 ? 3 : 1) : 0;
  const codes = new Set<(typeof ALLERGENS)[number]>();
  while (codes.size < allergyCount) codes.add(pick(rng, ALLERGENS));
  const exercise = pick(rng, ['none', '1to2', '3to4', '5to6', 'daily'] as const);
  const lifestyle = pick(rng, [
    'mostlySitting',
    'sometimesStanding',
    'mostlyStanding',
    'movingAllDay',
    'physicalLabour',
  ] as const);
  const activity = activityFromLifestyle({
    ageYears,
    exercise,
    lifestyle,
    strengthTraining: false,
  });
  const extra = ['clothesFit', 'overallHealth', 'fitness', 'energy', 'sleep'] as const;
  return quizAnswers({
    taste: randomTaste(rng),
    body: { sex, ageYears, heightCm, weightKg, mode: 'self' },
    goal: targetWeightKg !== undefined ? { goal, targetWeightKg } : { goal },
    diet: pick(rng, [
      'omnivore',
      'omnivore',
      'omnivore',
      'pescatarian',
      'vegetarianLactoOvo',
      'vegan',
    ] as const),
    macroProfile: pick(rng, [
      'recommended',
      'recommended',
      'recommended',
      'highProtein',
      'lowCarb',
      'lowFat',
      'keto',
    ] as const),
    health: { flags: [...health], pregnancy, lactation, custom: [] },
    allergies: {
      items: [...codes].map((code) => ({ code, level: pick(rng, LEVELS) })),
      custom: [],
    },
    ...(rng.next() < 0.3 ? { dislikesText: `не люблю ${pick(rng, DISLIKES)}` } : {}),
    activity: {
      exercise,
      strengthTraining: rng.next() < 0.2,
      lifestyle,
      ...(activity.pal !== undefined ? { pal: activity.pal } : {}),
      group: activity.group,
    },
    extraGoals: extra.filter(() => rng.next() < 0.2),
  });
}
