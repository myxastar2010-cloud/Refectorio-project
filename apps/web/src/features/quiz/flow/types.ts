import type {
  QUIZ_DIETS,
  QUIZ_GOALS,
  QUIZ_SEXES,
  SafetyAdjustment,
  TasteDecision,
} from '@refectorio/contracts';
import type {
  ExerciseFrequency,
  ExtraGoal,
  Lifestyle,
  MacroProfile,
} from '@refectorio/nutrition-core';
import type { AllergenChipId, HealthChipId, NoticeId } from '../../../content/quizSchema';

export type YesNo = 'yes' | 'no';
export type QuizSex = (typeof QUIZ_SEXES)[number];
export type QuizGoal = (typeof QUIZ_GOALS)[number];
export type FoodStyle = 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan';
export type InsulinAnswer = 'yes' | 'no' | 'unknown';
export type Trimester = 'trimester1' | 'trimester2' | 'trimester3';
export type LactationPeriod = 'months0to6' | 'months7to12';

export const FOOD_STYLE_DIET = {
  omnivore: 'omnivore',
  pescatarian: 'pescatarian',
  vegetarian: 'vegetarianLactoOvo',
  vegan: 'vegan',
} as const satisfies Record<FoodStyle, (typeof QUIZ_DIETS)[number]>;

/**
 * Everything the person answered, including answers of sub-steps that a parent answer now hides: they stay in the
 * draft (restored if the parent is switched back) but never reach the result (activeAnswers / buildResult).
 */
export type Answers = {
  readonly tasteSeed: number;
  readonly tasteDecisions: readonly TasteDecision[];
  /** The catalog ran out before 10 decisive answers (a very picky player): the quiz lets them continue. */
  readonly tasteExhausted: boolean;
  readonly sex?: QuizSex;
  readonly ageYears?: number;
  readonly heightCm?: number;
  readonly familyConfirmed: boolean;
  readonly goal?: QuizGoal;
  readonly weightKg?: number;
  readonly targetWeightKg?: number;
  readonly foodStyle?: FoodStyle;
  readonly macroProfile?: MacroProfile;
  readonly health?: YesNo;
  readonly healthChips: readonly HealthChipId[];
  readonly insulin?: InsulinAnswer;
  readonly trimester?: Trimester;
  readonly lactationPeriod?: LactationPeriod;
  readonly healthCustom: readonly string[];
  readonly allergy?: YesNo;
  readonly allergenChips: readonly AllergenChipId[];
  readonly severeTraces: boolean;
  readonly allergenCustom: readonly string[];
  readonly dislikes?: YesNo;
  readonly dislikesText: string;
  readonly exercise?: ExerciseFrequency;
  readonly strength?: YesNo;
  readonly lifestyle?: Lifestyle;
  /** «Помимо вашей основной цели…» (stage 3, §6): undefined — not answered yet; [] — skipped. */
  readonly extraGoals?: readonly ExtraGoal[];
  readonly notes: string;
};

export function emptyAnswers(tasteSeed: number): Answers {
  return {
    tasteSeed,
    tasteDecisions: [],
    tasteExhausted: false,
    familyConfirmed: false,
    healthChips: [],
    healthCustom: [],
    allergenChips: [],
    severeTraces: false,
    allergenCustom: [],
    dislikesText: '',
    notes: '',
  };
}

export const STEP_IDS = [
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
  'extraGoals',
  'notes',
] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Screens after the last step: the safety summary (if anything was changed) and the finale. */
export type Screen = StepId | 'adjustments' | 'finale';

export type QuizState = {
  readonly answers: Answers;
  readonly screen: Screen;
  /** Screens visited before the current one (Back pops it). */
  readonly history: readonly Screen[];
  /** Notices to show now, in order; the step waits behind them. */
  readonly notices: readonly NoticeId[];
  /** Notices already shown once (not repeated when the same rule fires again). */
  readonly seenNotices: readonly NoticeId[];
  /** Answers the quiz switched to a safe option (listed again before the finale). */
  readonly adjustments: readonly SafetyAdjustment[];
  /** «Далее» was pressed while notices were pending: advance once they are dismissed. */
  readonly advanceAfterNotices: boolean;
  readonly startedAt: string;
};
