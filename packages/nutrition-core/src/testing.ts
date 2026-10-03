import type { Questionnaire } from './types';

/** Test helper: a valid adult questionnaire with overrides. Excluded from coverage and from the public API. */
export function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    ageYears: 30,
    sex: 'female',
    heightCm: 165,
    weightKg: 60,
    activity: 'kfa2',
    goal: 'maintain',
    pregnancy: 'none',
    lactation: 'none',
    mode: 'self',
    health: [],
    edScreenPositive: false,
    allergens: [],
    diet: 'omnivore',
    mealsPerDay: 4,
    budget: 'unlimited',
    dislikes: [],
    ...overrides,
  };
}
