import {
  decisiveCount,
  DECISIVE_ANSWERS_REQUIRED,
  type SafetyAdjustment,
  type TasteDecision,
} from '@refectorio/contracts';
import { AGE_LIMITS, targetWeightBoundsKg, type ReasonCode } from '@refectorio/nutrition-core';
import type { NoticeId } from '../../../content/quizSchema';
import { activeHealthChips, ketoAllowed, safetyOf } from './safety';
import { nextStepId, stepDef, TOTAL_SLOTS } from './steps';
import { emptyAnswers, type Answers, type QuizState, type Screen, type StepId } from './types';

/**
 * The quiz state machine (pure reducer, unit-tested). Steps call `patch` while the person answers and `next` when a
 * step is done; safety rules run at those moments (`reconcile`) and may switch an answer to a safe option, queuing a
 * kind notice that the step shows before moving on (ТЗ §8.7).
 */
export type QuizAction =
  | { readonly type: 'patch'; readonly patch: Partial<Answers> }
  /** Forget answers that no longer fit (a target weight after the current weight changed). */
  | { readonly type: 'clear'; readonly keys: readonly ClearableKey[] }
  /** A row of «Цель» was committed: the goal rules run at once (the target row may disappear). */
  | { readonly type: 'rowCommitted' }
  | { readonly type: 'next' }
  | { readonly type: 'dismissNotice' }
  /** «Выбрать другое» of a confirmation notice: the answer it asked about is taken back, the step stays. */
  | { readonly type: 'declineNotice' }
  | { readonly type: 'back' }
  /** One answer of the dish game (an entry in the browser history of its own). */
  | { readonly type: 'tasteAnswer'; readonly decision: TasteDecision }
  | { readonly type: 'tasteUndo' }
  | { readonly type: 'tasteExhausted' }
  /** The browser went back this many entries (useQuizHistory). */
  | { readonly type: 'rewind'; readonly steps: number }
  | { readonly type: 'restart'; readonly seed: number; readonly now: string };

export type ClearableKey = 'targetWeightKg' | 'insulin' | 'trimester' | 'lactationPeriod';

export function initialQuizState(seed: number, now: string): QuizState {
  return {
    answers: emptyAnswers(seed),
    screen: 'taste',
    history: [],
    notices: [],
    seenNotices: [],
    adjustments: [],
    advanceAfterNotices: false,
    startedAt: now,
  };
}

/** Why a weight goal is not available — the notice that explains it (most specific first). */
function goalNotice(reasons: readonly ReasonCode[]): NoticeId | null {
  if (reasons.includes('PREGNANCY') || reasons.includes('LACTATION')) return 'pregnancyLactation';
  if (reasons.includes('ED_HISTORY') || reasons.includes('ED_SCREEN_POSITIVE'))
    return 'eatingDisorder';
  if (reasons.includes('DIABETES_TYPE2')) return 'diabetesGoal';
  if (reasons.includes('BMI_UNDERWEIGHT')) return 'underweightLose';
  if (reasons.includes('TEEN_NO_ENERGY_GOALS')) return 'teenGoals';
  if (reasons.includes('TODDLER_NO_INDIVIDUAL_ENERGY')) return 'toddler';
  if (reasons.includes('CHILD_FAMILY_MODE') || reasons.includes('CHILD_NEEDS_ADULT'))
    return 'childFamily';
  return null;
}

/** The target weight still lies inside the bounds of the current goal, weight, height and age (ТЗ §8.4). */
function targetFits(a: Answers): boolean {
  if (a.goal !== 'lose' && a.goal !== 'gain') return false;
  if (a.weightKg === undefined || a.heightCm === undefined || a.ageYears === undefined)
    return false;
  const bounds = targetWeightBoundsKg({
    goal: a.goal,
    currentKg: a.weightKg,
    heightCm: a.heightCm,
    ageYears: a.ageYears,
  });
  return (
    bounds !== null &&
    a.targetWeightKg !== undefined &&
    a.targetWeightKg >= bounds.minKg &&
    a.targetWeightKg <= bounds.maxKg
  );
}

function withoutTarget(a: Answers): Answers {
  const answers: Record<string, unknown> = { ...a };
  Reflect.deleteProperty(answers, 'targetWeightKg');
  return answers as Answers;
}

type Reconciled = {
  readonly answers: Answers;
  readonly adjustments: readonly SafetyAdjustment[];
  readonly notices: readonly NoticeId[];
};

/**
 * Where the health notices may come: the health step, and the later steps that can tick a health chip too (an
 * allergy to aspartame, a condition written in the dislikes or the notes — review-health-synonyms.md B.4, 5).
 */
const HEALTH_NOTICE_STEPS: readonly StepId[] = [
  'healthConditions',
  'allergens',
  'dislikesText',
  'notes',
];

/** Safety rules on the current answers: safe switches plus the notices that explain them (each notice once). */
export function reconcile(state: QuizState, step: StepId): Reconciled {
  let answers = state.answers;
  const adjustments = new Set(state.adjustments);
  const notices: NoticeId[] = [];
  // Each notice once: not after it was read, not while it waits in the queue.
  const queue = (id: NoticeId | null) => {
    if (id === null) return;
    if (state.seenNotices.includes(id) || state.notices.includes(id) || notices.includes(id))
      return;
    notices.push(id);
  };
  const { decision } = safetyOf(answers);
  const weightGoal = answers.goal === 'lose' || answers.goal === 'gain';

  // «Refused» (insulin, kidney disease, PKU) replaces the generation with the doctor screen and has a notice of its own.
  if (
    weightGoal &&
    answers.goal &&
    decision.status !== 'refused' &&
    !decision.allowedGoals.includes(answers.goal)
  ) {
    answers = { ...answers, goal: 'maintain' };
    adjustments.add('goalToMaintain');
    queue(goalNotice(decision.reasons));
  } else if (
    answers.goal === 'lose' &&
    answers.weightKg !== undefined &&
    answers.heightCm !== undefined &&
    answers.ageYears !== undefined &&
    answers.ageYears >= AGE_LIMITS.minorUnderYears &&
    targetWeightBoundsKg({
      goal: 'lose',
      currentKg: answers.weightKg,
      heightCm: answers.heightCm,
      ageYears: answers.ageYears,
    }) === null
  ) {
    // Within a kilogram of the floor: treated like BMI < 18.5 (ТЗ §8.4).
    answers = { ...answers, goal: 'maintain' };
    adjustments.add('goalToMaintain');
    queue('noValidTarget');
  }

  // A target left over from another goal, a corrected height or age: the target row asks again.
  if (answers.targetWeightKg !== undefined && !targetFits(answers))
    answers = withoutTarget(answers);

  if (answers.macroProfile === 'keto' && !ketoAllowed(decision)) {
    answers = { ...answers, macroProfile: 'recommended' };
    adjustments.add('ketoToRecommended');
    queue(decision.reasons.includes('DIABETES_TYPE2') ? 'diabetesKeto' : 'ketoUnavailable');
  }

  // Keto is allowed here, but it is not for everyone: a confirmation first (research/stage-2-mappings.md §7.11).
  if (step === 'macroProfile' && answers.macroProfile === 'keto' && ketoAllowed(decision)) {
    queue('ketoConfirm');
  }

  if (step === 'goalSetup' || step === 'goal') {
    if (decision.reasons.includes('OLDER_ADULT_CAUTION')) queue('olderAdult');
  }
  if (HEALTH_NOTICE_STEPS.includes(step) && answers.health === 'yes') {
    const chips = activeHealthChips(answers);
    if (decision.status === 'refused') {
      queue(
        chips.includes('diabetes') && answers.insulin === 'unknown' ? 'insulinUnknown' : 'refused',
      );
    }
    if (chips.includes('eatingDisorder')) queue('eatingDisorder');
    if (chips.includes('pregnancy') || chips.includes('lactation')) queue('pregnancyLactation');
    if (decision.reasons.includes('OTHER_CHRONIC')) queue('otherChronic');
  }
  return { answers, adjustments: [...adjustments], notices };
}

function withReconciled(state: QuizState, step: StepId): QuizState {
  const result = reconcile(state, step);
  return {
    ...state,
    answers: result.answers,
    adjustments: result.adjustments,
    notices: [...state.notices, ...result.notices],
  };
}

/** The screen after `screen`: the next shown step, then the safety summary (if anything changed), then the finale. */
export function nextScreen(state: QuizState): Screen {
  const { screen } = state;
  if (screen === 'finale') return 'finale';
  if (screen === 'adjustments') return 'finale';
  const next = nextStepId(screen, state.answers);
  if (next) return next;
  return state.adjustments.length > 0 ? 'adjustments' : 'finale';
}

function advance(state: QuizState): QuizState {
  const screen = nextScreen(state);
  if (screen === state.screen) return state;
  return {
    ...state,
    screen,
    history: [...state.history, state.screen],
    advanceAfterNotices: false,
  };
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'patch': {
      // A new own choice of the goal or the diet type drops the record of the earlier safe switch; reconcile adds it
      // again if the switch is still needed.
      const dropped = new Set<SafetyAdjustment>();
      if (action.patch.goal !== undefined) dropped.add('goalToMaintain');
      if (action.patch.macroProfile !== undefined) dropped.add('ketoToRecommended');
      return {
        ...state,
        answers: { ...state.answers, ...action.patch },
        adjustments:
          dropped.size > 0 ? state.adjustments.filter((a) => !dropped.has(a)) : state.adjustments,
      };
    }
    case 'clear': {
      const answers: Record<string, unknown> = { ...state.answers };
      for (const key of action.keys) Reflect.deleteProperty(answers, key);
      return { ...state, answers: answers as Answers };
    }
    case 'rowCommitted':
      return state.screen === 'finale' || state.screen === 'adjustments'
        ? state
        : withReconciled(state, state.screen);
    case 'next': {
      if (state.screen === 'finale') return state;
      if (state.screen === 'adjustments') return advance(state);
      const checked = withReconciled(state, state.screen);
      if (checked.notices.length > 0) return { ...checked, advanceAfterNotices: true };
      return advance(checked);
    }
    case 'dismissNotice': {
      const [read, ...notices] = state.notices;
      const next = {
        ...state,
        notices,
        seenNotices: read === undefined ? state.seenNotices : [...state.seenNotices, read],
      };
      return notices.length === 0 && state.advanceAfterNotices ? advance(next) : next;
    }
    case 'declineNotice': {
      const [declined, ...notices] = state.notices;
      const answers: Record<string, unknown> = { ...state.answers };
      if (declined === 'ketoConfirm') Reflect.deleteProperty(answers, 'macroProfile');
      return { ...state, answers: answers as Answers, notices, advanceAfterNotices: false };
    }
    case 'back': {
      const previous = state.history.at(-1);
      if (previous === undefined) return state;
      return {
        ...state,
        screen: previous,
        history: state.history.slice(0, -1),
        notices: [],
        advanceAfterNotices: false,
      };
    }
    case 'tasteAnswer':
      return {
        ...state,
        answers: {
          ...state.answers,
          tasteDecisions: [...state.answers.tasteDecisions, action.decision],
        },
      };
    case 'tasteUndo':
      return {
        ...state,
        answers: {
          ...state.answers,
          tasteDecisions: state.answers.tasteDecisions.slice(0, -1),
          tasteExhausted: false,
        },
      };
    case 'tasteExhausted':
      return { ...state, answers: { ...state.answers, tasteExhausted: true } };
    case 'rewind':
      return rewind(state, action.steps);
    case 'restart':
      return initialQuizState(action.seed, action.now);
  }
}

/**
 * The game's last answer moves the quiz on by itself, so the answer and the step forward share one history entry:
 * Back from «О вас» returns to the game with that card again (ТЗ §7.4). Leaving through «Дальше» of an exhausted
 * catalog is a click of its own and keeps its own entry.
 */
const leftGameWithAnswer = (state: Pick<QuizState, 'answers' | 'history'>) =>
  state.history.length > 0 &&
  !state.answers.tasteExhausted &&
  state.answers.tasteDecisions.length > 0;

/**
 * Entries this quiz owns in the browser history: one per dish answer and one per step forward; Back walks them back
 * (features/quiz/useQuizHistory).
 */
export const historyDepth = (state: Pick<QuizState, 'answers' | 'history'>) =>
  state.answers.tasteDecisions.length + state.history.length - (leftGameWithAnswer(state) ? 1 : 0);

/** Undoes `steps` entries: screens first, then dish answers (on the game screen). */
export function rewind(state: QuizState, steps: number): QuizState {
  let next = state;
  for (let i = 0; i < steps; i += 1) {
    if (next.history.length > 0) {
      const merged = next.history.length === 1 && leftGameWithAnswer(next);
      next = quizReducer(next, { type: 'back' });
      if (merged) next = quizReducer(next, { type: 'tasteUndo' });
    } else if (next.answers.tasteDecisions.length > 0) {
      next = quizReducer(next, { type: 'tasteUndo' });
    } else break;
  }
  return next;
}

/**
 * Progress 0…1 (ТЗ §7.3): 11 slots, a sub-step at +½ slot, the dish game fills its slot by decisive answers;
 * 100 % only in the finale.
 */
export function progressOf(state: Pick<QuizState, 'screen' | 'answers'>): number {
  if (state.screen === 'finale') return 1;
  if (state.screen === 'adjustments') return (TOTAL_SLOTS - 0.25) / TOTAL_SLOTS;
  const step = stepDef(state.screen);
  let value = step.slot + (step.sub ? 0.5 : 0);
  if (step.id === 'taste') {
    value += Math.min(1, decisiveCount(state.answers.tasteDecisions) / DECISIVE_ANSWERS_REQUIRED);
  }
  return value / TOTAL_SLOTS;
}
