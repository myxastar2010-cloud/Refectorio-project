import {
  QUIZ_GOALS,
  QUIZ_SEXES,
  SAFETY_ADJUSTMENTS,
  quizAnswersV1Schema,
  tasteDecisionSchema,
  type QuizAnswersV1,
} from '@refectorio/contracts';
import {
  EXERCISE_FREQUENCIES,
  EXTRA_GOALS,
  INPUT_LIMITS,
  LIFESTYLES,
  MACRO_PROFILES,
} from '@refectorio/nutrition-core';
import { z } from 'zod';
import { ALLERGEN_CHIP_IDS, HEALTH_CHIP_IDS, NOTICE_IDS } from '../../../content/quizSchema';
import { STEP_IDS, type QuizState } from './types';

/**
 * Guest mode (D-018, ТЗ §11.2): the draft and the result live only in this browser's localStorage. Read back through
 * zod — a corrupted, foreign or old draft is discarded quietly and the quiz starts fresh. Storage may be unavailable
 * (private mode, blocked site data): every access is wrapped and the quiz works without it.
 */
export const DRAFT_KEY = 'refectorio.quiz.v1';
export const RESULT_KEY = 'refectorio.quiz.result.v1';
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const yesNo = z.enum(['yes', 'no']);
const text = (max: number) => z.string().max(max);
const items = z.array(text(INPUT_LIMITS.customItemMaxLength)).max(INPUT_LIMITS.customItemsMaxItems);

const answersSchema = z.object({
  tasteSeed: z.int().nonnegative(),
  tasteDecisions: z.array(tasteDecisionSchema).max(300),
  tasteExhausted: z.boolean(),
  sex: z.enum(QUIZ_SEXES).optional(),
  ageYears: z.int().min(1).max(100).optional(),
  heightCm: z.int().min(50).max(230).optional(),
  familyConfirmed: z.boolean(),
  goal: z.enum(QUIZ_GOALS).optional(),
  weightKg: z.number().min(5).max(250).optional(),
  targetWeightKg: z.number().min(5).max(250).optional(),
  foodStyle: z.enum(['omnivore', 'pescatarian', 'vegetarian', 'vegan']).optional(),
  macroProfile: z.enum(MACRO_PROFILES).optional(),
  health: yesNo.optional(),
  healthChips: z.array(z.enum(HEALTH_CHIP_IDS)),
  insulin: z.enum(['yes', 'no', 'unknown']).optional(),
  trimester: z.enum(['trimester1', 'trimester2', 'trimester3']).optional(),
  lactationPeriod: z.enum(['months0to6', 'months7to12']).optional(),
  healthCustom: items,
  allergy: yesNo.optional(),
  allergenChips: z.array(z.enum(ALLERGEN_CHIP_IDS)),
  severeTraces: z.boolean(),
  allergenCustom: items,
  dislikes: yesNo.optional(),
  dislikesText: text(INPUT_LIMITS.dislikesOtherMaxLength),
  exercise: z.enum(EXERCISE_FREQUENCIES).optional(),
  strength: yesNo.optional(),
  lifestyle: z.enum(LIFESTYLES).optional(),
  // Stage 3 (§6): optional — a stage-2 draft stays valid and resumes at this question.
  extraGoals: z.array(z.enum(EXTRA_GOALS)).optional(),
  notes: text(INPUT_LIMITS.notesMaxLength),
});

const screen = z.enum([...STEP_IDS, 'adjustments', 'finale']);

const draftSchema = z.object({
  version: z.literal(1),
  savedAt: z.number(),
  state: z.object({
    answers: answersSchema,
    screen,
    history: z.array(screen).max(64),
    seenNotices: z.array(z.enum(NOTICE_IDS)),
    adjustments: z.array(z.enum(SAFETY_ADJUSTMENTS)),
    startedAt: z.string(),
  }),
});

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(state: QuizState, now = Date.now()): void {
  const store = storage();
  if (!store) return;
  // Pending notices are not kept: a resumed quiz shows the step itself.
  const kept = {
    answers: state.answers,
    screen: state.screen,
    history: state.history,
    seenNotices: state.seenNotices,
    adjustments: state.adjustments,
    startedAt: state.startedAt,
  };
  try {
    store.setItem(DRAFT_KEY, JSON.stringify({ version: 1, savedAt: now, state: kept }));
  } catch {
    // Quota or privacy mode: the quiz simply continues without a draft.
  }
}

export function loadDraft(now = Date.now()): QuizState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || now - parsed.data.savedAt > DRAFT_TTL_MS) {
      store.removeItem(DRAFT_KEY);
      return null;
    }
    return { ...parsed.data.state, notices: [], advanceAfterNotices: false } as QuizState;
  } catch {
    return null;
  }
}

export function saveResult(result: QuizAnswersV1): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(RESULT_KEY, JSON.stringify(quizAnswersV1Schema.parse(result)));
  } catch {
    // Without storage the result simply is not kept.
  }
}

export function loadResult(): QuizAnswersV1 | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(RESULT_KEY);
    if (!raw) return null;
    const parsed = quizAnswersV1Schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** «Удалить мои ответы»: the draft and the result. */
export function deleteAll(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(DRAFT_KEY);
    store.removeItem(RESULT_KEY);
  } catch {
    // Nothing to do.
  }
}
