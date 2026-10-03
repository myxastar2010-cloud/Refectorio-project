import { err, ok, type Result } from './result';
import type {
  ActivityGroup,
  AllergenCode,
  AllergenLevel,
  Budget,
  Diet,
  Goal,
  HealthFlag,
  Lactation,
  Mode,
  Pregnancy,
  Questionnaire,
  Sex,
} from './types';

/** Accepted input ranges (research/algorithm-spec.md §2). */
export const INPUT_LIMITS = {
  ageYears: { min: 0, max: 120 },
  heightCm: { min: 45, max: 250 },
  weightKg: { min: 2, max: 350 },
  bodyFatPct: { min: 3, max: 70 },
  ratePctPerWeek: { min: 0, max: 1 },
  mealsPerDay: { min: 2, max: 6 },
  cookTimeMaxMin: { min: 5, max: 180 },
  /** BMI outside this range almost certainly means a typo in height or weight. */
  bmi: { min: 10, max: 100 },
  dislikesMaxItems: 20,
  dislikeMaxLength: 40,
  dislikesOtherMaxLength: 150,
} as const;

export type InputErrorCode =
  | 'NOT_A_NUMBER'
  | 'OUT_OF_RANGE'
  | 'PREGNANCY_REQUIRES_FEMALE_OR_UNSPECIFIED'
  | 'LACTATION_REQUIRES_FEMALE_OR_UNSPECIFIED'
  | 'IMPLAUSIBLE_BMI'
  | 'TOO_MANY_ITEMS'
  | 'TOO_LONG';

export type InputError = { readonly field: keyof Questionnaire; readonly code: InputErrorCode };

/** Raw questionnaire as it comes from the UI: shape is typed, values are not trusted yet. */
export type QuestionnaireInput = {
  ageYears: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  bodyFatPct?: number;
  activity: ActivityGroup;
  goal: Goal;
  ratePctPerWeek?: number;
  pregnancy?: Pregnancy;
  lactation?: Lactation;
  mode?: Mode;
  health?: readonly HealthFlag[];
  edScreenPositive?: boolean;
  allergens?: readonly { code: AllergenCode; level: AllergenLevel }[];
  diet?: Diet;
  mealsPerDay?: number;
  cookTimeMaxMin?: number;
  budget?: Budget;
  dislikes?: readonly string[];
  dislikesOther?: string;
};

const DEFAULT_MEALS_PER_DAY = 4;

function checkRange(
  errors: InputError[],
  field: keyof typeof INPUT_LIMITS & keyof Questionnaire,
  value: number | undefined,
): void {
  if (value === undefined) return;
  if (!Number.isFinite(value)) {
    errors.push({ field, code: 'NOT_A_NUMBER' });
    return;
  }
  const { min, max } = INPUT_LIMITS[field];
  if (value < min || value > max) errors.push({ field, code: 'OUT_OF_RANGE' });
}

/** Validates ranges and cross-field rules; returns every problem at once so the UI can show them together. */
export function validateQuestionnaire(
  input: QuestionnaireInput,
): Result<Questionnaire, InputError[]> {
  const errors: InputError[] = [];
  checkRange(errors, 'ageYears', input.ageYears);
  checkRange(errors, 'heightCm', input.heightCm);
  checkRange(errors, 'weightKg', input.weightKg);
  checkRange(errors, 'bodyFatPct', input.bodyFatPct);
  checkRange(errors, 'ratePctPerWeek', input.ratePctPerWeek);
  checkRange(errors, 'mealsPerDay', input.mealsPerDay);
  checkRange(errors, 'cookTimeMaxMin', input.cookTimeMaxMin);

  const pregnancy = input.pregnancy ?? 'none';
  const lactation = input.lactation ?? 'none';
  if (pregnancy !== 'none' && input.sex === 'male') {
    errors.push({ field: 'pregnancy', code: 'PREGNANCY_REQUIRES_FEMALE_OR_UNSPECIFIED' });
  }
  if (lactation !== 'none' && input.sex === 'male') {
    errors.push({ field: 'lactation', code: 'LACTATION_REQUIRES_FEMALE_OR_UNSPECIFIED' });
  }

  const heightOk = !errors.some((e) => e.field === 'heightCm');
  const weightOk = !errors.some((e) => e.field === 'weightKg');
  if (heightOk && weightOk) {
    const bmi = input.weightKg / (input.heightCm / 100) ** 2;
    if (bmi < INPUT_LIMITS.bmi.min || bmi > INPUT_LIMITS.bmi.max) {
      errors.push({ field: 'weightKg', code: 'IMPLAUSIBLE_BMI' });
    }
  }

  const dislikes = input.dislikes ?? [];
  if (dislikes.length > INPUT_LIMITS.dislikesMaxItems) {
    errors.push({ field: 'dislikes', code: 'TOO_MANY_ITEMS' });
  }
  if (dislikes.some((item) => item.length > INPUT_LIMITS.dislikeMaxLength)) {
    errors.push({ field: 'dislikes', code: 'TOO_LONG' });
  }
  if ((input.dislikesOther?.length ?? 0) > INPUT_LIMITS.dislikesOtherMaxLength) {
    errors.push({ field: 'dislikesOther', code: 'TOO_LONG' });
  }

  if (errors.length > 0) return err(errors);

  return ok({
    ageYears: input.ageYears,
    sex: input.sex,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    // Body fat is only meaningful for adults (Katch–McArdle is an adult equation).
    ...(input.bodyFatPct !== undefined && input.ageYears >= 18
      ? { bodyFatPct: input.bodyFatPct }
      : {}),
    activity: input.activity,
    goal: input.goal,
    ...(input.ratePctPerWeek !== undefined ? { ratePctPerWeek: input.ratePctPerWeek } : {}),
    pregnancy,
    lactation,
    mode: input.mode ?? 'self',
    health: [...new Set(input.health ?? [])],
    edScreenPositive: input.edScreenPositive ?? false,
    allergens: input.allergens ?? [],
    diet: input.diet ?? 'omnivore',
    mealsPerDay: input.mealsPerDay ?? DEFAULT_MEALS_PER_DAY,
    ...(input.cookTimeMaxMin !== undefined ? { cookTimeMaxMin: input.cookTimeMaxMin } : {}),
    budget: input.budget ?? 'unlimited',
    dislikes: dislikes.map((item) => item.trim()).filter(Boolean),
    ...(input.dislikesOther !== undefined ? { dislikesOther: input.dislikesOther.trim() } : {}),
  });
}
