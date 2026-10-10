import { describe, expect, it } from 'vitest';
import {
  historyDepth,
  initialQuizState,
  nextScreen,
  progressOf,
  quizReducer,
  reconcile,
  rewind,
  type QuizAction,
} from './machine';
import { firstIncompleteStep, nextStepId, questionNumber, STEPS } from './steps';
import type { Answers, QuizState } from './types';

const NOW = '2026-10-09T10:00:00.000Z';
const run = (state: QuizState, ...actions: QuizAction[]) => actions.reduce(quizReducer, state);
const patch = (p: Partial<Answers>): QuizAction => ({ type: 'patch', patch: p });
const next: QuizAction = { type: 'next' };

const tenDecisions = Array.from({ length: 10 }, (_, i) => ({
  dishId: `d_dish_${i}`,
  answer: i % 2 === 0 ? ('like' as const) : ('dislike' as const),
}));

/** An adult who finished the dish game and «О вас». */
function adultAt(screen: QuizState['screen'], extra: Partial<Answers> = {}): QuizState {
  const base = initialQuizState(1, NOW);
  return {
    ...base,
    screen,
    answers: {
      ...base.answers,
      tasteDecisions: tenDecisions,
      sex: 'female',
      ageYears: 30,
      heightCm: 165,
      ...extra,
    },
  };
}

describe('steps', () => {
  it('follow the order of D-031: Tinder → О вас → Цель → настройка → …', () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      'taste',
      'body',
      'goal',
      'goalSetup',
      'foodStyle',
      'macroProfile',
      'health',
      'healthConditions',
      'allergy',
      'allergens',
      'dislikes',
      'dislikesText',
      'activity',
      'strength',
      'lifestyle',
      'notes',
    ]);
    expect(questionNumber('body')).toBe(2);
    expect(questionNumber('notes')).toBe(11);
  });

  it('«Нет» skips the sub-steps, «Да» shows them', () => {
    const base = initialQuizState(1, NOW).answers;
    expect(nextStepId('health', { ...base, health: 'no' })).toBe('allergy');
    expect(nextStepId('health', { ...base, health: 'yes' })).toBe('healthConditions');
    expect(nextStepId('allergy', { ...base, allergy: 'no' })).toBe('dislikes');
    expect(nextStepId('dislikes', { ...base, dislikes: 'yes' })).toBe('dislikesText');
    expect(nextStepId('activity', { ...base, exercise: 'none' })).toBe('lifestyle');
    expect(nextStepId('activity', { ...base, exercise: '3to4' })).toBe('strength');
    expect(nextStepId('notes', base)).toBeNull();
  });

  it('a resumed draft continues at the first incomplete step', () => {
    const state = adultAt('goal');
    expect(firstIncompleteStep(state.answers)).toBe('goal');
    expect(firstIncompleteStep(initialQuizState(1, NOW).answers)).toBe('taste');
  });

  it('a child needs the adult confirmation before «О вас» is complete', () => {
    const child = adultAt('body', { ageYears: 9, heightCm: 130 });
    expect(firstIncompleteStep(child.answers)).toBe('body');
    expect(firstIncompleteStep({ ...child.answers, familyConfirmed: true })).toBe('goal');
  });
});

describe('machine', () => {
  it('walks forward, keeps history and goes back with the answers kept', () => {
    let state = adultAt('goal');
    state = run(state, patch({ goal: 'maintain' }), next);
    expect(state.screen).toBe('goalSetup');
    expect(state.history).toEqual(['goal']);
    state = run(state, { type: 'back' });
    expect(state.screen).toBe('goal');
    expect(state.answers.goal).toBe('maintain');
    expect(run(initialQuizState(1, NOW), { type: 'back' }).screen).toBe('taste');
  });

  it('a hidden sub-answer stays in the draft and returns when the parent is switched back', () => {
    let state = adultAt('health', { health: 'yes', healthChips: ['hypertension'] });
    state = run(state, patch({ health: 'no' }), next);
    expect(state.screen).toBe('allergy');
    expect(state.answers.healthChips).toEqual(['hypertension']);
  });

  it('adult BMI < 18.5 with «Сжигание жира»: goal → maintain, notice, then advance', () => {
    let state = adultAt('goalSetup', { goal: 'lose' });
    state = run(state, patch({ weightKg: 45 }), { type: 'rowCommitted' });
    expect(state.answers.goal).toBe('maintain');
    expect(state.adjustments).toEqual(['goalToMaintain']);
    expect(state.notices).toEqual(['underweightLose']);
    // «Далее» while the notice is still up: the step waits, «Понятно» then moves on.
    state = run(state, next);
    expect(state.screen).toBe('goalSetup');
    expect(state.advanceAfterNotices).toBe(true);
    state = run(state, { type: 'dismissNotice' });
    expect(state.screen).toBe('foodStyle');
  });

  it('within a kilogram of BMI 18.5 there is no valid target: treated the same way', () => {
    const state = run(adultAt('goalSetup', { goal: 'lose' }), patch({ weightKg: 51.4 }), {
      type: 'rowCommitted',
    });
    expect(state.answers.goal).toBe('maintain');
    expect(state.notices).toEqual(['noValidTarget']);
  });

  it('pregnancy after a weight-loss goal: goal → maintain with the pregnancy notice', () => {
    let state = adultAt('healthConditions', {
      goal: 'lose',
      weightKg: 70,
      targetWeightKg: 65,
      health: 'yes',
      healthChips: ['pregnancy'],
      trimester: 'trimester2',
    });
    state = run(state, next);
    expect(state.answers.goal).toBe('maintain');
    expect(state.notices).toEqual(['pregnancyLactation']);
    expect(state.advanceAfterNotices).toBe(true);
    state = run(state, { type: 'dismissNotice' });
    expect(state.screen).toBe('allergy');
  });

  it('type 2 diabetes with keto: keto → recommended, diabetes notice; each notice only once', () => {
    let state = adultAt('healthConditions', {
      goal: 'maintain',
      macroProfile: 'keto',
      health: 'yes',
      healthChips: ['diabetes'],
      insulin: 'no',
    });
    state = run(state, next);
    expect(state.answers.macroProfile).toBe('recommended');
    expect(state.adjustments).toEqual(['ketoToRecommended']);
    expect(state.notices).toEqual(['diabetesKeto']);
    state = run(
      state,
      { type: 'dismissNotice' },
      { type: 'back' },
      patch({ macroProfile: 'keto' }),
      next,
    );
    expect(state.notices).toEqual([]);
    expect(state.answers.macroProfile).toBe('recommended');
  });

  it('insulin «Не знаю» takes the safer branch: refused with its own notice', () => {
    const state = run(
      adultAt('healthConditions', {
        goal: 'maintain',
        health: 'yes',
        healthChips: ['diabetes'],
        insulin: 'unknown',
      }),
      next,
    );
    expect(state.notices).toEqual(['insulinUnknown']);
    const insulin = run(
      adultAt('healthConditions', {
        goal: 'maintain',
        health: 'yes',
        healthChips: ['kidneyDisease'],
      }),
      next,
    );
    expect(insulin.notices).toEqual(['refused']);
  });

  it('eating disorder: notice and no weight goal', () => {
    const state = run(
      adultAt('healthConditions', {
        goal: 'gain',
        weightKg: 60,
        health: 'yes',
        healthChips: ['eatingDisorder'],
      }),
      next,
    );
    expect(state.answers.goal).toBe('maintain');
    expect(state.notices).toEqual(['eatingDisorder']);
  });

  it('a teenager whose age changed after a weight goal: goal → maintain with the teen notice', () => {
    const state = run(adultAt('goalSetup', { ageYears: 16, goal: 'lose', weightKg: 60 }), next);
    expect(state.answers.goal).toBe('maintain');
    expect(state.notices).toEqual(['teenGoals']);
  });

  it('65+ with weight loss: the older-adult note', () => {
    const state = run(adultAt('goal', { ageYears: 70, goal: 'lose' }), next);
    expect(state.notices).toEqual(['olderAdult']);
  });

  it('after the last step: the safety summary when something was changed, then the finale', () => {
    const changed = { ...adultAt('notes'), adjustments: ['goalToMaintain' as const] };
    expect(nextScreen(changed)).toBe('adjustments');
    expect(run(changed, next, next).screen).toBe('finale');
    expect(nextScreen(adultAt('notes'))).toBe('finale');
    expect(run(adultAt('notes'), next, next).screen).toBe('finale');
  });

  it('restart gives a fresh state with a new seed', () => {
    const state = run(adultAt('notes'), { type: 'restart', seed: 7, now: NOW });
    expect(state.screen).toBe('taste');
    expect(state.answers.tasteSeed).toBe(7);
  });

  it('reconcile leaves safe answers alone', () => {
    const state = adultAt('goalSetup', { goal: 'lose', weightKg: 70, targetWeightKg: 64 });
    expect(reconcile(state, 'goalSetup')).toEqual({
      answers: state.answers,
      adjustments: [],
      notices: [],
    });
  });
});

describe('progress', () => {
  it('slots of 11, sub-steps at +½, the game by decisive answers, 100 % only in the finale', () => {
    const base = initialQuizState(1, NOW);
    expect(progressOf(base)).toBe(0);
    expect(
      progressOf({
        screen: 'taste',
        answers: { ...base.answers, tasteDecisions: tenDecisions.slice(0, 5) },
      }),
    ).toBeCloseTo(0.5 / 11, 10);
    expect(progressOf({ screen: 'body', answers: base.answers })).toBeCloseTo(1 / 11, 10);
    expect(progressOf({ screen: 'goalSetup', answers: base.answers })).toBeCloseTo(2.5 / 11, 10);
    expect(progressOf({ screen: 'notes', answers: base.answers })).toBeCloseTo(10 / 11, 10);
    expect(progressOf({ screen: 'adjustments', answers: base.answers })).toBeLessThan(1);
    expect(progressOf({ screen: 'finale', answers: base.answers })).toBe(1);
  });
});

describe('history entries', () => {
  const answered = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ dishId: `d_dish_${i}`, answer: 'like' as const }));
  const aboutYou = patch({ sex: 'female', ageYears: 30, heightCm: 165 });

  it('one entry per dish answer and per step; the last answer and the step forward share one', () => {
    const base = initialQuizState(1, NOW);
    const playing = { ...base, answers: { ...base.answers, tasteDecisions: answered(4) } };
    expect(historyDepth(playing)).toBe(4);
    const left = run(adultAt('taste', { tasteDecisions: answered(10) }), next);
    expect(left.screen).toBe('body');
    expect(historyDepth(left)).toBe(10);
    const further = run(left, aboutYou, next);
    expect(further.screen).toBe('goal');
    expect(historyDepth(further)).toBe(11);
  });

  it('Back from «О вас» returns to the game with its last card again', () => {
    const left = run(adultAt('taste', { tasteDecisions: answered(10) }), next);
    const back = rewind(left, 1);
    expect(back.screen).toBe('taste');
    expect(back.answers.tasteDecisions).toHaveLength(9);
    expect(historyDepth(back)).toBe(9);
  });

  it('leaving an exhausted catalog is an entry of its own', () => {
    const base = initialQuizState(1, NOW);
    const exhausted = run(
      { ...base, answers: { ...base.answers, tasteDecisions: answered(3) } },
      { type: 'tasteExhausted' },
      next,
    );
    expect(exhausted.screen).toBe('body');
    expect(historyDepth(exhausted)).toBe(4);
    const back = rewind(exhausted, 1);
    expect(back.screen).toBe('taste');
    expect(back.answers.tasteDecisions).toHaveLength(3);
  });

  it('rewinds several entries: screens first, then answers; never below the start', () => {
    const left = run(adultAt('taste', { tasteDecisions: answered(10) }), next);
    const further = run(left, aboutYou, next);
    const back = rewind(further, 3);
    expect(back.screen).toBe('taste');
    expect(back.answers.tasteDecisions).toHaveLength(8);
    expect(rewind(back, 50).answers.tasteDecisions).toHaveLength(0);
  });
});
