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
import { evaluateGuardrails, validateQuestionnaire } from '@refectorio/nutrition-core';
import {
  applyAnswer,
  buildProfile,
  catalogSchema,
  initialState,
  prepareCatalog,
  type Catalog,
} from '@refectorio/taste-core';
import catalogJson from '@refectorio/taste-core/data/catalog.json';
import { foodTextSchema } from '@refectorio/food-data';
import { buildFoodIndex, type FoodIndex } from './foods';

let cachedFoods: FoodIndex | null = null;
let cachedCatalog: Catalog | null = null;

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
  const prepared = prepareCatalog(catalog);
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
