import { quizAnswersV1Schema, type TasteProfileV1 } from '@refectorio/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchAllergenChips } from './allergenSynonyms';
import { initialQuizState, reconcile } from './machine';
import {
  deleteAll,
  DRAFT_KEY,
  DRAFT_TTL_MS,
  loadDraft,
  loadResult,
  saveDraft,
  saveResult,
} from './persistence';
import { buildResult } from './result';
import {
  allergenItems,
  eligibleHealthChips,
  extraGoalOptions,
  healthFlags,
  ketoAllowed,
  safetyOf,
  visibleHealthChips,
} from './safety';
import { firstIncompleteStep, nextStepId } from './steps';
import type { Answers, QuizState } from './types';

const NOW = '2026-10-09T10:00:00.000Z';
const base = initialQuizState(3, NOW).answers;
const with_ = (p: Partial<Answers>): Answers => ({ ...base, ...p });

describe('safety on partial answers', () => {
  it('the design shows five chips (pregnancy for women 14–55); the others are reachable by age and sex', () => {
    expect(visibleHealthChips(with_({ sex: 'female', ageYears: 30 }))).toEqual([
      'diabetes',
      'hypertension',
      'hypothyroidism',
      'insulinResistance',
      'pregnancy',
    ]);
    expect(visibleHealthChips(with_({ sex: 'female', ageYears: 56 }))).not.toContain('pregnancy');
    expect(visibleHealthChips(with_({ sex: 'male', ageYears: 30 }))).not.toContain('pregnancy');
    expect(eligibleHealthChips(with_({ sex: 'male', ageYears: 30 }))).not.toContain('lactation');
    expect(eligibleHealthChips(with_({ sex: 'female', ageYears: 30 }))).toContain('lactation');
    // Children 1–13 see only the child conditions; kidney disease and PKU now through «+» (their flags stay).
    expect(visibleHealthChips(with_({ sex: 'female', ageYears: 9 }))).toEqual([
      'diabetes',
      'hypothyroidism',
    ]);
    expect(eligibleHealthChips(with_({ sex: 'female', ageYears: 9 }))).toEqual([
      'diabetes',
      'hypothyroidism',
      'kidneyDisease',
      'pku',
    ]);
  });

  it('chips become flags only when «Да» was answered; diabetes follows the insulin answer', () => {
    const answers = with_({ healthChips: ['diabetes', 'hypertension'], insulin: 'no' });
    expect(healthFlags(answers)).toEqual([]);
    expect(healthFlags({ ...answers, health: 'yes' })).toEqual(['diabetesType2', 'hypertension']);
    expect(healthFlags({ ...answers, health: 'yes', insulin: 'unknown' })).toContain(
      'diabetesInsulin',
    );
  });

  it('allergens: lactose stays an intolerance, the traces switch makes the others severe', () => {
    const answers = with_({ allergy: 'yes', allergenChips: ['lactose', 'peanut'] });
    expect(allergenItems(answers)).toEqual([
      { code: 'MILK', level: 'intolerance' },
      { code: 'PEANUT', level: 'allergy' },
    ]);
    expect(allergenItems({ ...answers, severeTraces: true })).toEqual([
      { code: 'MILK', level: 'intolerance' },
      { code: 'PEANUT', level: 'severeAllergy' },
    ]);
    // Lactose and milk together: the stricter level wins.
    expect(allergenItems({ ...answers, allergenChips: ['lactose', 'milk'] })).toEqual([
      { code: 'MILK', level: 'allergy' },
    ]);
    expect(allergenItems({ ...answers, allergy: 'no' })).toEqual([]);
  });

  it('teenagers: no weight goals and no keto', () => {
    const { decision } = safetyOf(with_({ sex: 'male', ageYears: 16, heightCm: 175 }));
    expect(decision.allowedGoals).toEqual(['maintain', 'habits']);
    expect(ketoAllowed(decision)).toBe(false);
  });

  it('a child without the adult confirmation needs an adult', () => {
    expect(safetyOf(with_({ ageYears: 9, heightCm: 130 })).decision.status).toBe('requiresAdult');
    expect(
      safetyOf(with_({ ageYears: 9, heightCm: 130, familyConfirmed: true })).decision.status,
    ).toBe('limited');
  });

  it('an implausible BMI is reported, not crashed on', () => {
    const safety = safetyOf(with_({ ageYears: 30, heightCm: 200, weightKg: 30 }));
    expect(safety.plausible).toBe(false);
    expect(safety.decision.status).toBe('allowed');
  });
});

describe('allergen synonyms (whole words, never substrings)', () => {
  it.each([
    ['креветки', ['crustacean']],
    ['Сельдерей', ['celery']],
    ['сельдь под шубой', ['fish']],
    ['кальмары и мидии', ['mollusc']],
    ['горчица', ['mustard']],
    ['пшеница', ['gluten']],
    ['лактоза', ['lactose']],
    ['земляной орех', ['peanut']],
    ['миндальное молоко', ['treeNut']],
    ['крабовые палочки', ['fish', 'egg', 'crustacean']],
    ['сыр', ['milk']],
    ['яйца', ['egg']],
    ['Е220', ['sulphites']],
    ['тахини', ['sesame']],
  ])('%s → %j', (text, chips) => {
    expect(matchAllergenChips(text)).toEqual(chips);
  });

  it.each([
    'пшено',
    'сырники',
    'яичник',
    'рак',
    'икра',
    'орехи',
    'молочная кислота',
    'кокосовое молоко',
    'киви',
    'карпаччо',
  ])('%s → nothing', (text) => {
    expect(matchAllergenChips(text)).toEqual([]);
  });
});

/** A minimal in-memory localStorage for the node test environment. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: () => null,
    length: 0,
  } as Storage;
}

describe('persistence', () => {
  beforeEach(() => {
    Object.assign(globalThis, { window: { localStorage: memoryStorage() } });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('saves and restores a draft (pending notices are not kept)', () => {
    const state: QuizState = {
      ...initialQuizState(5, NOW),
      screen: 'goal',
      history: ['taste', 'body'],
      notices: ['teenGoals'],
      answers: with_({ sex: 'female', ageYears: 30, heightCm: 165 }),
    };
    saveDraft(state, 1000);
    const restored = loadDraft(2000);
    expect(restored?.screen).toBe('goal');
    expect(restored?.history).toEqual(['taste', 'body']);
    expect(restored?.notices).toEqual([]);
    expect(restored?.answers.heightCm).toBe(165);
  });

  it('discards an old, corrupted or foreign draft quietly', () => {
    saveDraft(initialQuizState(5, NOW), 0);
    expect(loadDraft(DRAFT_TTL_MS + 1)).toBeNull();
    window.localStorage.setItem(DRAFT_KEY, '{not json');
    expect(loadDraft()).toBeNull();
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: 2, state: {} }));
    expect(loadDraft()).toBeNull();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('works without storage at all (private mode)', () => {
    Object.assign(globalThis, {
      window: {
        get localStorage(): Storage {
          throw new Error('blocked');
        },
      },
    });
    expect(() => {
      saveDraft(initialQuizState(5, NOW));
    }).not.toThrow();
    expect(loadDraft()).toBeNull();
    expect(loadResult()).toBeNull();
    expect(() => {
      deleteAll();
    }).not.toThrow();
  });
});

const taste: TasteProfileV1 = {
  version: 1,
  engineVersion: 'taste-core@1.0.0',
  catalogVersion: '2026-10-09',
  seed: 3,
  decisions: [{ dishId: 'd_borscht', answer: 'like' }],
  features: [],
  predictions: [],
  hints: [],
};

describe('result', () => {
  beforeEach(() => {
    Object.assign(globalThis, { window: { localStorage: memoryStorage() } });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  const complete = (p: Partial<Answers> = {}): QuizState => ({
    ...initialQuizState(3, NOW),
    screen: 'finale',
    answers: with_({
      sex: 'female',
      ageYears: 30,
      heightCm: 165,
      weightKg: 70,
      goal: 'lose',
      targetWeightKg: 64,
      foodStyle: 'pescatarian',
      macroProfile: 'highProtein',
      health: 'no',
      healthChips: ['hypertension'],
      allergy: 'yes',
      allergenChips: ['crustacean'],
      allergenCustom: ['креветки', ' Креветки '],
      dislikes: 'no',
      dislikesText: 'оливки',
      exercise: '3to4',
      strength: 'yes',
      lifestyle: 'mostlySitting',
      notes: '  обычно я завтракаю фруктами ',
      ...p,
    }),
  });

  it('builds a valid QuizAnswersV1 with only the active answers', () => {
    const result = buildResult(complete(), taste, NOW);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(quizAnswersV1Schema.safeParse(result).success).toBe(true);
    expect(result.health.flags).toEqual([]);
    expect(result.allergies.custom).toEqual(['креветки']);
    expect('dislikesText' in result).toBe(false);
    expect(result.notes).toBe('обычно я завтракаю фруктами');
    expect(result.diet).toBe('pescatarian');
    expect(result.activity).toMatchObject({ group: 'kfa2', strengthTraining: true, pal: 1.5 });
    expect(result.goal).toEqual({ goal: 'lose', targetWeightKg: 64 });
    saveResult(result);
    expect(loadResult()).toEqual(result);
  });

  it('drops the target for maintain and the strength answer without sport', () => {
    const result = buildResult(complete({ goal: 'maintain', exercise: 'none' }), taste, NOW);
    expect(result?.goal).toEqual({ goal: 'maintain' });
    expect(result?.activity.strengthTraining).toBe(false);
  });

  it('extra goals (§6): chosen, skipped ([]) or never asked (family mode: absent)', () => {
    expect(
      buildResult(complete({ extraGoals: ['energy', 'sleep'] }), taste, NOW)?.extraGoals,
    ).toEqual(['energy', 'sleep']);
    expect(buildResult(complete({ extraGoals: [] }), taste, NOW)?.extraGoals).toEqual([]);
    const stage2 = buildResult(complete(), taste, NOW);
    expect(stage2 && 'extraGoals' in stage2).toBe(false);
    // A body-image answer never reaches the result of someone who may not see it.
    expect(
      buildResult(
        complete({ ageYears: 16, goal: 'maintain', extraGoals: ['clothesFit', 'sleep'] }),
        taste,
        NOW,
      )?.extraGoals,
    ).toEqual(['sleep']);
  });

  it('returns null while something required is missing', () => {
    const state = complete();
    const { lifestyle, ...rest } = state.answers;
    expect(lifestyle).toBe('mostlySitting');
    expect(buildResult({ ...state, answers: rest }, taste, NOW)).toBeNull();
  });
});

describe('«Помимо вашей основной цели…» (stage 3, §6)', () => {
  const adult = with_({ sex: 'female', ageYears: 30, heightCm: 165 });

  it('is second to last, and not asked in family mode', () => {
    expect(nextStepId('lifestyle', adult)).toBe('extraGoals');
    expect(nextStepId('extraGoals', adult)).toBe('notes');
    expect(nextStepId('lifestyle', { ...adult, ageYears: 9, familyConfirmed: true })).toBe('notes');
  });

  it('no «одежда лучше сидела» under 18 or with an eating disorder (R08)', () => {
    expect(extraGoalOptions(adult)).toEqual([
      'clothesFit',
      'overallHealth',
      'fitness',
      'energy',
      'sleep',
    ]);
    expect(extraGoalOptions({ ...adult, ageYears: 16 })).not.toContain('clothesFit');
    expect(
      extraGoalOptions({ ...adult, health: 'yes', healthChips: ['eatingDisorder'] }),
    ).not.toContain('clothesFit');
  });

  it('an eating disorder added later («Вернуться») drops the answer quietly', () => {
    const state: QuizState = {
      ...initialQuizState(3, NOW),
      screen: 'healthConditions',
      answers: {
        ...adult,
        health: 'yes',
        healthChips: ['eatingDisorder'],
        extraGoals: ['clothesFit', 'energy'],
      },
    };
    expect(reconcile(state, 'healthConditions').answers.extraGoals).toEqual(['energy']);
  });

  it('a stage-2 draft resumes at the new question by its id; a skip counts as an answer', () => {
    const stage2: Answers = with_({
      tasteDecisions: Array.from({ length: 10 }, (_, i) => ({
        dishId: `d_dish_${i}`,
        answer: 'like' as const,
      })),
      sex: 'female',
      ageYears: 30,
      heightCm: 165,
      weightKg: 70,
      goal: 'maintain',
      foodStyle: 'omnivore',
      macroProfile: 'recommended',
      health: 'no',
      allergy: 'no',
      dislikes: 'no',
      exercise: 'none',
      lifestyle: 'mostlySitting',
    });
    expect(firstIncompleteStep(stage2)).toBe('extraGoals');
    expect(firstIncompleteStep({ ...stage2, extraGoals: [] })).toBeNull();
  });
});
