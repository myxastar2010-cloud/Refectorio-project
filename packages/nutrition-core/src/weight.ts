import { AGE_LIMITS, BMI_UNDERWEIGHT_BELOW } from './guardrails';
import type { Goal } from './types';

/**
 * Weight ranges for the goal setup screen (algorithm-spec.md §4.4, research/stage-2-mappings.md §6).
 * Everything is rounded to whole kilograms inwards, so a shown bound never leaves the BMI band.
 */
export const WEIGHT_RULES = {
  /** WHO adult «normal» BMI band 18.5–24.9 kg/m² (research/R05 §1). */
  adultBmi: { min: BMI_UNDERWEIGHT_BELOW, max: 24.9 },
  /**
   * 65+: the WHO band is not age-adjusted; in older adults mortality is lowest at a higher BMI (Winter et al. 2014,
   * Am J Clin Nutr, meta-analysis: risk rises below ≈23). ⚠ Interpretation of R05 §1 pending fact-check.
   */
  olderAdultBmi: { min: 23, max: 29.9 },
  /** Losing weight never aims below BMI 18.5 (algorithm-spec.md §4.4). */
  loseFloorBmi: BMI_UNDERWEIGHT_BELOW,
  /**
   * Gain: at most +15 % of the current weight — about a year at the default rate of 0.25 %/week (R04, RATE_PCT_PER_WEEK).
   * ⚠ Engineering bound: a target further away is better set in steps.
   */
  gainMaxFactor: 1.15,
  stepKg: 1,
} as const;

export type WeightRangeKg = { readonly minKg: number; readonly maxKg: number };

const heightM2 = (heightCm: number) => (heightCm / 100) ** 2;

/** «Рекомендуется от X до Y кг»: adults only (children are assessed by BMI-for-age, which we do not show). */
export function recommendedWeightRangeKg(heightCm: number, ageYears: number): WeightRangeKg | null {
  if (ageYears < AGE_LIMITS.minorUnderYears) return null;
  const band =
    ageYears >= AGE_LIMITS.olderAdultFromYears ? WEIGHT_RULES.olderAdultBmi : WEIGHT_RULES.adultBmi;
  const h2 = heightM2(heightCm);
  return { minKg: Math.ceil(band.min * h2), maxKg: Math.floor(band.max * h2) };
}

export type TargetWeightInput = {
  readonly goal: Goal;
  readonly currentKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
};

/**
 * Bounds of the target weight wheel. Direction rule (user: «выбрать вес ниже собственного нельзя» for gain):
 * gain → above the current weight, lose → below it and never below BMI 18.5. `null` — there is no valid target:
 * maintain/habits, minors (no weight goals, D-009), or a person already within a kilogram of BMI 18.5 who chose
 * to lose (the quiz then treats it like BMI < 18.5: a kind notice and «Поддержка веса»).
 */
export function targetWeightBoundsKg(input: TargetWeightInput): WeightRangeKg | null {
  const { goal, currentKg, heightCm, ageYears } = input;
  if (ageYears < AGE_LIMITS.minorUnderYears) return null;
  const current = Math.round(currentKg);
  if (goal === 'lose') {
    const minKg = Math.ceil(WEIGHT_RULES.loseFloorBmi * heightM2(heightCm));
    const maxKg = current - WEIGHT_RULES.stepKg;
    return minKg <= maxKg ? { minKg, maxKg } : null;
  }
  if (goal === 'gain') {
    const minKg = current + WEIGHT_RULES.stepKg;
    // The epsilon keeps 60 × 1.15 at 69 (binary floating point gives 68.999…).
    const maxKg = Math.max(minKg, Math.floor(currentKg * WEIGHT_RULES.gainMaxFactor + 1e-9));
    return { minKg, maxKg };
  }
  return null;
}

/** Where the target wheel starts: one kilogram in the goal's direction, inside the bounds. */
export function targetWeightStartKg(input: TargetWeightInput): number | null {
  const bounds = targetWeightBoundsKg(input);
  if (!bounds) return null;
  return input.goal === 'lose' ? bounds.maxKg : bounds.minKg;
}
