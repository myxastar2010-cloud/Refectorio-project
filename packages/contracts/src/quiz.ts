import {
  ACTIVITY_GROUPS,
  ALLERGEN_CODES,
  ALLERGEN_LEVELS,
  DISH_RULES,
  EXERCISE_FREQUENCIES,
  GOALS,
  GUARDRAIL_STATUSES,
  HEALTH_FLAGS,
  INPUT_LIMITS,
  LACTATION_STATES,
  LIFESTYLES,
  MACRO_PROFILES,
  MODES,
  PREGNANCY_STATES,
  REASON_CODES,
  REGIMES,
  SPECIALISTS,
  type QuestionnaireInput,
} from '@refectorio/nutrition-core';
import { z } from 'zod';
import { tasteProfileV1Schema } from './taste';

/**
 * QuizAnswersV1 — the result of the stage-2 quiz, versioned for stage 3 (menu generation).
 * Only active answers are here (a sub-step hidden by a parent answer is not). Free text stays verbatim and separate
 * from dictionary items: it is untrusted data for the stage-3 AI (R11), never instructions.
 */
export const QUIZ_ANSWERS_VERSION = 1;

/** Quiz wheel ranges: inside nutrition-core INPUT_LIMITS (toddlers in family mode need the low weights). */
export const QUIZ_RANGES = {
  ageYears: { min: 1, max: 100, step: 1 },
  heightCm: { min: 50, max: 230, step: 1 },
  weightKg: { min: 5, max: 250, step: 1, typedDecimals: 1 },
} as const;

/** The quiz asks only these two (user decision; R13 suggested a third option — documented deviation). */
export const QUIZ_SEXES = ['male', 'female'] as const;
export const QUIZ_GOALS = ['lose', 'gain', 'maintain'] as const;
export const QUIZ_DIETS = ['omnivore', 'pescatarian', 'vegetarianLactoOvo', 'vegan'] as const;

const range = (limits: { readonly min: number; readonly max: number }) =>
  z.number().min(limits.min).max(limits.max);
const wholeNumberIn = (limits: { readonly min: number; readonly max: number }) =>
  z.int().min(limits.min).max(limits.max);
/** Typed weights may have one decimal (comma or dot in the UI). */
const weightKg = range(QUIZ_RANGES.weightKg).refine(
  (value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9,
  'one decimal at most',
);
const customItems = z
  .array(z.string().trim().min(1).max(INPUT_LIMITS.customItemMaxLength))
  .max(INPUT_LIMITS.customItemsMaxItems);

/** nutrition-core GuardrailDecision as stored (its arrays are readonly). */
export const guardrailSnapshotSchema = z.object({
  status: z.enum(GUARDRAIL_STATUSES),
  reasons: z.array(z.enum(REASON_CODES)).readonly(),
  referToDoctor: z.array(z.enum(SPECIALISTS)).readonly(),
  allowedGoals: z.array(z.enum(GOALS)).readonly(),
  energyDeficitAllowed: z.boolean(),
  energySurplusAllowed: z.boolean(),
  deemphasizeNumbers: z.boolean(),
  forbiddenRegimes: z.array(z.enum(REGIMES)).readonly(),
  dishRules: z.array(z.enum(DISH_RULES)).readonly(),
  guestOnly: z.boolean(),
  individualEnergy: z.boolean(),
});

/** An answer the quiz switched to a safe option (shown to the person again before the finale). */
export const SAFETY_ADJUSTMENTS = ['goalToMaintain', 'ketoToRecommended'] as const;

export const quizAnswersV1Schema = z
  .object({
    version: z.literal(QUIZ_ANSWERS_VERSION),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    taste: tasteProfileV1Schema,
    body: z.object({
      sex: z.enum(QUIZ_SEXES),
      ageYears: wholeNumberIn(QUIZ_RANGES.ageYears),
      heightCm: wholeNumberIn(QUIZ_RANGES.heightCm),
      weightKg,
      /** `family`: an adult fills the quiz for a child 1–13 (guardrails: CHILD_FAMILY_MODE). */
      mode: z.enum(MODES),
    }),
    goal: z.object({
      goal: z.enum(QUIZ_GOALS),
      /** Lose/gain only; absent for maintain and whenever weight goals are unavailable. */
      targetWeightKg: weightKg.optional(),
    }),
    diet: z.enum(QUIZ_DIETS),
    macroProfile: z.enum(MACRO_PROFILES),
    health: z.object({
      flags: z.array(z.enum(HEALTH_FLAGS)),
      pregnancy: z.enum(PREGNANCY_STATES),
      lactation: z.enum(LACTATION_STATES),
      custom: customItems,
    }),
    allergies: z.object({
      items: z.array(z.object({ code: z.enum(ALLERGEN_CODES), level: z.enum(ALLERGEN_LEVELS) })),
      custom: customItems,
    }),
    dislikesText: z.string().max(INPUT_LIMITS.dislikesOtherMaxLength).optional(),
    activity: z.object({
      exercise: z.enum(EXERCISE_FREQUENCIES),
      strengthTraining: z.boolean(),
      lifestyle: z.enum(LIFESTYLES),
      /** Derived by nutrition-core activityFromLifestyle(). */
      pal: z.number().min(1).max(2.5),
      group: z.enum(ACTIVITY_GROUPS),
    }),
    notes: z.string().max(INPUT_LIMITS.notesMaxLength).optional(),
    guardrails: guardrailSnapshotSchema,
    adjustments: z.array(z.enum(SAFETY_ADJUSTMENTS)),
  })
  .superRefine((answers, ctx) => {
    const { body, goal, health, allergies } = answers;
    if (body.sex === 'male' && (health.pregnancy !== 'none' || health.lactation !== 'none')) {
      ctx.addIssue({
        code: 'custom',
        path: ['health'],
        message: 'pregnancy/lactation need sex female',
      });
    }
    if (body.mode === 'family' && body.ageYears >= 14) {
      ctx.addIssue({ code: 'custom', path: ['body', 'mode'], message: 'family mode is for 1–13' });
    }
    const target = goal.targetWeightKg;
    if (target !== undefined) {
      const wrongDirection =
        goal.goal === 'maintain' ||
        (goal.goal === 'lose' && target >= body.weightKg) ||
        (goal.goal === 'gain' && target <= body.weightKg);
      if (wrongDirection) {
        ctx.addIssue({ code: 'custom', path: ['goal', 'targetWeightKg'], message: 'direction' });
      }
    }
    if (new Set(health.flags).size !== health.flags.length) {
      ctx.addIssue({ code: 'custom', path: ['health', 'flags'], message: 'duplicates' });
    }
    if (new Set(allergies.items.map((item) => item.code)).size !== allergies.items.length) {
      ctx.addIssue({ code: 'custom', path: ['allergies', 'items'], message: 'one level per code' });
    }
  });

export type QuizAnswersV1 = z.infer<typeof quizAnswersV1Schema>;
export type GuardrailSnapshot = z.infer<typeof guardrailSnapshotSchema>;
export type SafetyAdjustment = (typeof SAFETY_ADJUSTMENTS)[number];

/** The part of the answers nutrition-core needs (the quiz also calls it on partial answers to re-run guardrails). */
export type QuestionnaireAnswers = Pick<
  QuizAnswersV1,
  'body' | 'goal' | 'diet' | 'macroProfile' | 'health' | 'allergies' | 'activity'
> &
  Partial<Pick<QuizAnswersV1, 'dislikesText' | 'notes'>>;

/** Quiz answers → nutrition-core questionnaire (then validateQuestionnaire → guardrails → norms). */
export function toQuestionnaireInput(answers: QuestionnaireAnswers): QuestionnaireInput {
  const { body, goal, health, allergies, activity } = answers;
  return {
    ageYears: body.ageYears,
    sex: body.sex,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    activity: activity.group,
    goal: goal.goal,
    pregnancy: health.pregnancy,
    lactation: health.lactation,
    mode: body.mode,
    health: health.flags,
    allergens: allergies.items,
    diet: answers.diet,
    macroProfile: answers.macroProfile,
    strengthTraining: activity.strengthTraining,
    healthOther: health.custom,
    allergensOther: allergies.custom,
    ...(answers.dislikesText ? { dislikesOther: answers.dislikesText } : {}),
    ...(answers.notes ? { notes: answers.notes } : {}),
  };
}
