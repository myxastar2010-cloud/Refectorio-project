import {
  evaluateGuardrails,
  INPUT_LIMITS,
  validateQuestionnaire,
} from '@refectorio/nutrition-core';
import { describe, expect, it } from 'vitest';
import { QUIZ_RANGES, quizAnswersV1Schema, toQuestionnaireInput, type QuizAnswersV1 } from './quiz';
import { decisiveCount, tasteProfileV1Schema, type TasteProfileV1 } from './taste';

const taste: TasteProfileV1 = {
  version: 1,
  engineVersion: 'taste-core@1.0.0',
  catalogVersion: '2026-10-09',
  seed: 42,
  decisions: [
    { dishId: 'd_borscht', answer: 'like' },
    { dishId: 'd_sushi_rolls', answer: 'skip' },
    { dishId: 'd_syrniki', answer: 'dislike' },
  ],
  features: [{ id: 'course:soup', mean: 0.8, variance: 0.3 }],
  predictions: [{ dishId: 'd_borscht', pLike: 0.91 }],
  hints: [{ hint: 'likesSoups', confidence: 0.8 }],
};

function adult(overrides: Partial<QuizAnswersV1> = {}): QuizAnswersV1 {
  const base: Omit<QuizAnswersV1, 'guardrails'> = {
    version: 1,
    createdAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-09T10:03:00.000Z',
    taste,
    body: { sex: 'female', ageYears: 30, heightCm: 165, weightKg: 70.5, mode: 'self' },
    goal: { goal: 'lose', targetWeightKg: 64 },
    diet: 'pescatarian',
    macroProfile: 'highProtein',
    health: { flags: ['hypertension'], pregnancy: 'none', lactation: 'none', custom: ['Анемия'] },
    allergies: { items: [{ code: 'CRUSTACEAN', level: 'allergy' }], custom: ['креветки'] },
    dislikesText: 'оливки, кабачки',
    activity: {
      exercise: '3to4',
      strengthTraining: true,
      lifestyle: 'mostlySitting',
      pal: 1.5,
      group: 'kfa2',
    },
    notes: 'обычно я завтракаю фруктами',
    adjustments: [],
    ...overrides,
  };
  const input = validateQuestionnaire(toQuestionnaireInput(base));
  if (!input.ok) throw new Error(JSON.stringify(input.error));
  return { ...base, guardrails: evaluateGuardrails(input.value), ...overrides };
}

const issues = (value: unknown) => {
  const result = quizAnswersV1Schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('QuizAnswersV1', () => {
  it('accepts a full adult answer set', () => {
    expect(issues(adult())).toEqual([]);
  });

  it('round-trips into nutrition-core: valid questionnaire, same guardrail decision', () => {
    const answers = quizAnswersV1Schema.parse(adult());
    const input = validateQuestionnaire(toQuestionnaireInput(answers));
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    expect(input.value).toMatchObject({
      ageYears: 30,
      sex: 'female',
      heightCm: 165,
      weightKg: 70.5,
      activity: 'kfa2',
      goal: 'lose',
      diet: 'pescatarian',
      health: ['hypertension'],
      allergens: [{ code: 'CRUSTACEAN', level: 'allergy' }],
      healthOther: ['Анемия'],
      allergensOther: ['креветки'],
      dislikesOther: 'оливки, кабачки',
      notes: 'обычно я завтракаю фруктами',
      macroProfile: 'highProtein',
      strengthTraining: true,
    });
    expect(evaluateGuardrails(input.value)).toEqual(answers.guardrails);
  });

  it('omits empty optional free text from the questionnaire', () => {
    const { notes, dislikesText, ...rest } = adult();
    expect([notes, dislikesText].every(Boolean)).toBe(true);
    const input = toQuestionnaireInput({ ...rest, dislikesText: '' });
    expect('dislikesOther' in input).toBe(false);
    expect('notes' in input).toBe(false);
  });

  it('extra goals (stage 3, §6): optional — stage-2 results stay valid; passed to nutrition-core as they are', () => {
    // A stage-2 result has no extraGoals at all.
    expect(issues(adult())).toEqual([]);
    expect('extraGoals' in toQuestionnaireInput(adult())).toBe(false);
    const skipped = adult({ extraGoals: [] });
    expect(issues(skipped)).toEqual([]);
    const chosen = adult({ extraGoals: ['energy', 'sleep'] });
    expect(issues(chosen)).toEqual([]);
    const input = validateQuestionnaire(toQuestionnaireInput(chosen));
    expect(input.ok && input.value.extraGoals).toEqual(['energy', 'sleep']);
    expect(issues({ ...chosen, extraGoals: ['sixPack'] })).toEqual(['extraGoals.0']);
  });

  it('rejects pregnancy or lactation for sex male', () => {
    const answers = adult();
    expect(
      issues({
        ...answers,
        body: { ...answers.body, sex: 'male' },
        health: { ...answers.health, pregnancy: 'trimester1' },
      }),
    ).toEqual(['health']);
    expect(
      issues({
        ...answers,
        body: { ...answers.body, sex: 'male' },
        health: { ...answers.health, lactation: 'months0to6' },
      }),
    ).toEqual(['health']);
  });

  it('family mode only for children 1–13', () => {
    const answers = adult();
    expect(issues({ ...answers, body: { ...answers.body, mode: 'family' } })).toEqual([
      'body.mode',
    ]);
    expect(
      issues({
        ...answers,
        body: { ...answers.body, mode: 'family', ageYears: 9, heightCm: 130, weightKg: 27 },
        goal: { goal: 'maintain' },
      }),
    ).toEqual([]);
  });

  it('target weight follows the goal direction and exists only for lose/gain', () => {
    const answers = adult();
    expect(issues({ ...answers, goal: { goal: 'lose', targetWeightKg: 71 } })).toEqual([
      'goal.targetWeightKg',
    ]);
    expect(issues({ ...answers, goal: { goal: 'gain', targetWeightKg: 70 } })).toEqual([
      'goal.targetWeightKg',
    ]);
    expect(issues({ ...answers, goal: { goal: 'gain', targetWeightKg: 75 } })).toEqual([]);
    expect(issues({ ...answers, goal: { goal: 'maintain', targetWeightKg: 65 } })).toEqual([
      'goal.targetWeightKg',
    ]);
    expect(issues({ ...answers, goal: { goal: 'maintain' } })).toEqual([]);
  });

  it('rejects duplicate flags and two levels for one allergen', () => {
    const answers = adult();
    expect(
      issues({
        ...answers,
        health: { ...answers.health, flags: ['hypertension', 'hypertension'] },
      }),
    ).toEqual(['health.flags']);
    expect(
      issues({
        ...answers,
        allergies: {
          ...answers.allergies,
          items: [
            { code: 'MILK', level: 'intolerance' },
            { code: 'MILK', level: 'allergy' },
          ],
        },
      }),
    ).toEqual(['allergies.items']);
  });

  it('enforces the quiz ranges, one decimal and the text limits', () => {
    const answers = adult();
    expect(issues({ ...answers, body: { ...answers.body, ageYears: 101 } })).toEqual([
      'body.ageYears',
    ]);
    expect(issues({ ...answers, body: { ...answers.body, heightCm: 170.5 } })).toEqual([
      'body.heightCm',
    ]);
    expect(issues({ ...answers, body: { ...answers.body, weightKg: 70.25 } })).toEqual([
      'body.weightKg',
    ]);
    expect(issues({ ...answers, notes: 'я'.repeat(301) })).toEqual(['notes']);
    expect(issues({ ...answers, dislikesText: 'я'.repeat(501) })).toEqual(['dislikesText']);
    expect(
      issues({
        ...answers,
        health: { ...answers.health, custom: Array.from({ length: 11 }, (_, i) => `x${i}`) },
      }),
    ).toEqual(['health.custom']);
  });

  it('quiz ranges lie inside the nutrition-core input limits', () => {
    for (const key of ['ageYears', 'heightCm', 'weightKg'] as const) {
      expect(QUIZ_RANGES[key].min).toBeGreaterThanOrEqual(INPUT_LIMITS[key].min);
      expect(QUIZ_RANGES[key].max).toBeLessThanOrEqual(INPUT_LIMITS[key].max);
    }
  });
});

describe('TasteProfileV1', () => {
  it('accepts a profile and counts only decisive answers', () => {
    expect(tasteProfileV1Schema.safeParse(taste).success).toBe(true);
    expect(decisiveCount(taste.decisions)).toBe(2);
  });

  it('rejects malformed dish ids and probabilities', () => {
    expect(
      tasteProfileV1Schema.safeParse({
        ...taste,
        decisions: [{ dishId: 'borscht', answer: 'like' }],
      }).success,
    ).toBe(false);
    expect(
      tasteProfileV1Schema.safeParse({
        ...taste,
        predictions: [{ dishId: 'd_borscht', pLike: 1.2 }],
      }).success,
    ).toBe(false);
  });
});
