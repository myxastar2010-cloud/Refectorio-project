import {
  QUIZ_ANSWERS_VERSION,
  quizAnswersV1Schema,
  type QuizAnswersV1,
  type TasteProfileV1,
} from '@refectorio/contracts';
import { activityFromLifestyle, cleanItems } from '@refectorio/nutrition-core';
import {
  allergenItems,
  extraGoalOptions,
  healthFlags,
  lactationOf,
  pregnancyOf,
  safetyOf,
} from './safety';
import { isShown, stepDef } from './steps';
import { FOOD_STYLE_DIET, type QuizState } from './types';

/**
 * The finished quiz → QuizAnswersV1 (ТЗ §11.1). Only active answers: a sub-step hidden by its parent's answer is left
 * out, free text stays verbatim (trimmed, deduplicated) and apart from the dictionary items. Returns null while
 * something required is missing.
 */
export function buildResult(
  state: QuizState,
  taste: TasteProfileV1,
  now: string,
): QuizAnswersV1 | null {
  const a = state.answers;
  if (
    a.sex === undefined ||
    a.ageYears === undefined ||
    a.heightCm === undefined ||
    a.weightKg === undefined ||
    a.goal === undefined ||
    a.foodStyle === undefined ||
    a.macroProfile === undefined ||
    a.exercise === undefined ||
    a.lifestyle === undefined
  ) {
    return null;
  }
  const strengthTraining = a.exercise !== 'none' && a.strength === 'yes';
  const activity = activityFromLifestyle({
    exercise: a.exercise,
    lifestyle: a.lifestyle,
    strengthTraining,
    ageYears: a.ageYears,
  });
  const { decision } = safetyOf(a);
  const target =
    (a.goal === 'lose' || a.goal === 'gain') && a.targetWeightKg !== undefined
      ? { targetWeightKg: a.targetWeightKg }
      : {};
  const dislikesText = a.dislikes === 'yes' ? a.dislikesText.trim() : '';
  const notes = a.notes.trim();
  // Asked only outside family mode; what the person may no longer see (reconcile) never reaches the result.
  const extraGoals =
    isShown(stepDef('extraGoals'), a) && a.extraGoals
      ? a.extraGoals.filter((goal) => extraGoalOptions(a).includes(goal))
      : undefined;
  const candidate: QuizAnswersV1 = {
    version: QUIZ_ANSWERS_VERSION,
    createdAt: state.startedAt,
    updatedAt: now,
    taste,
    body: {
      sex: a.sex,
      ageYears: a.ageYears,
      heightCm: a.heightCm,
      weightKg: a.weightKg,
      mode: a.ageYears < 14 && a.familyConfirmed ? 'family' : 'self',
    },
    goal: { goal: a.goal, ...target },
    diet: FOOD_STYLE_DIET[a.foodStyle],
    macroProfile: a.macroProfile,
    health: {
      flags: healthFlags(a),
      pregnancy: pregnancyOf(a),
      lactation: lactationOf(a),
      custom: a.health === 'yes' ? cleanItems(a.healthCustom) : [],
    },
    allergies: {
      items: allergenItems(a),
      custom: a.allergy === 'yes' ? cleanItems(a.allergenCustom) : [],
    },
    ...(dislikesText ? { dislikesText } : {}),
    activity: {
      exercise: a.exercise,
      strengthTraining,
      lifestyle: a.lifestyle,
      ...(activity.pal !== undefined ? { pal: activity.pal } : {}),
      group: activity.group,
    },
    ...(notes ? { notes } : {}),
    ...(extraGoals ? { extraGoals } : {}),
    guardrails: decision,
    adjustments: [...state.adjustments],
  };
  const parsed = quizAnswersV1Schema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
