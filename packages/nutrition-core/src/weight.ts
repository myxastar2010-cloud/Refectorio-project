import { AGE_LIMITS, BMI_UNDERWEIGHT_BELOW } from './guardrails';
import type { Goal } from './types';

/**
 * Weight ranges for the goal setup screen (algorithm-spec.md §4.4, research/stage-2-mappings.md §6).
 * Bounds are whole kilograms rounded inwards, so a shown bound never leaves its BMI band. The bands are half-open
 * like the WHO categories ([18.5; 25) is «normal», adultBmiCategory): the top is ceil(25·h²) − 1, not 24.9·h².
 */
export const WEIGHT_RULES = {
  /** WHO adult «normal» BMI band [18.5; 25) kg/m² (research/R05 §1). */
  adultBmi: { min: BMI_UNDERWEIGHT_BELOW, below: 25 },
  /**
   * 65+: the WHO band is not age-adjusted. Winter et al. 2014 (Am J Clin Nutr 99:875, meta-analysis of 32 cohorts):
   * mortality rises below BMI 23 and above 33 in older adults → we show [23; 30).
   */
  olderAdultBmi: { min: 23, below: 30 },
  /** Losing weight never aims below BMI 18.5 (algorithm-spec.md §4.4); for 65+ — below 23 (Winter 2014). */
  loseFloorBmi: BMI_UNDERWEIGHT_BELOW,
  /**
   * Gain: at most +15 % of the current weight per goal and not beyond BMI 25, but always at least +5 % — BMI does not
   * tell muscle from fat, and the guardrails allow muscle gain at any BMI (⚠ engineering, stage-2-mappings §6.2;
   * the research suggested no gain above BMI 30 — D-033 keeps a modest +5 % instead).
   */
  gainMaxFactor: 1.15,
  gainMinCapFactor: 1.05,
  gainBmiCap: 25,
  stepKg: 1,
} as const;

export type WeightRangeKg = { readonly minKg: number; readonly maxKg: number };

const heightM2 = (heightCm: number) => (heightCm / 100) ** 2;
/** Weight at a BMI rounded up / the largest whole weight strictly below a BMI. */
const atLeast = (bmi: number, h2: number) => Math.ceil(bmi * h2 - 1e-9);
const below = (bmi: number, h2: number) => Math.ceil(bmi * h2 - 1e-9) - 1;

const isOlder = (ageYears: number) => ageYears >= AGE_LIMITS.olderAdultFromYears;

/** «Рекомендуется от X до Y кг»: adults only (children are assessed by BMI-for-age, which we do not show). */
export function recommendedWeightRangeKg(heightCm: number, ageYears: number): WeightRangeKg | null {
  if (ageYears < AGE_LIMITS.minorUnderYears) return null;
  const band = isOlder(ageYears) ? WEIGHT_RULES.olderAdultBmi : WEIGHT_RULES.adultBmi;
  const h2 = heightM2(heightCm);
  return { minKg: atLeast(band.min, h2), maxKg: below(band.below, h2) };
}

export type TargetWeightInput = {
  readonly goal: Goal;
  readonly currentKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
};

/**
 * Bounds of the target weight wheel. Direction rule (user: «выбрать вес ниже собственного нельзя» for gain):
 * gain → at least a kilogram above the current weight, lose → at least a kilogram below it and never below the
 * floor. `null` — no valid target: maintain/habits, minors (no weight goals, D-009), or a person within a kilogram of
 * the floor who chose to lose (the quiz then treats it like BMI < 18.5: a kind notice and «Поддержка веса»).
 */
export function targetWeightBoundsKg(input: TargetWeightInput): WeightRangeKg | null {
  const { goal, currentKg, heightCm, ageYears } = input;
  if (ageYears < AGE_LIMITS.minorUnderYears) return null;
  const h2 = heightM2(heightCm);
  if (goal === 'lose') {
    const floorBmi = isOlder(ageYears) ? WEIGHT_RULES.olderAdultBmi.min : WEIGHT_RULES.loseFloorBmi;
    const minKg = atLeast(floorBmi, h2);
    const maxKg = Math.floor(currentKg - WEIGHT_RULES.stepKg + 1e-9);
    return minKg <= maxKg ? { minKg, maxKg } : null;
  }
  if (goal === 'gain') {
    const minKg = Math.ceil(currentKg + WEIGHT_RULES.stepKg - 1e-9);
    const cap = Math.min(
      currentKg * WEIGHT_RULES.gainMaxFactor,
      Math.max(currentKg * WEIGHT_RULES.gainMinCapFactor, below(WEIGHT_RULES.gainBmiCap, h2)),
    );
    // The epsilon keeps 60 × 1.15 at 69 (binary floating point gives 68.999…).
    return { minKg, maxKg: Math.max(minKg, Math.floor(cap + 1e-9)) };
  }
  return null;
}

/** Where the target wheel starts: one kilogram in the goal's direction, inside the bounds. */
export function targetWeightStartKg(input: TargetWeightInput): number | null {
  const bounds = targetWeightBoundsKg(input);
  if (!bounds) return null;
  return input.goal === 'lose' ? bounds.maxKg : bounds.minKg;
}
