import eer from '../data/nasem-2023-eer.json';
import type { ActivityGroup, Sex } from '../types';

type Coefficients = { intercept: number; age: number; height: number; weight: number };
type NasemActivity = 'inactive' | 'lowActive' | 'active' | 'veryActive';

/** МР activity groups mapped onto NASEM physical-activity categories (research/algorithm-spec.md §4.3, engineering choice). */
export const NASEM_ACTIVITY: Readonly<Record<ActivityGroup, NasemActivity>> = {
  kfa1: 'inactive',
  kfa2: 'lowActive',
  kfa3: 'active',
  kfa4: 'veryActive',
};

export const EER_CHILD_MIN_AGE_YEARS = 3;
export const EER_CHILD_MAX_AGE_YEARS = 19;

export type ChildInput = {
  readonly ageYears: number;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly sex: Sex;
  readonly activity: ActivityGroup;
};

function energyDepositionKcal(ageYears: number, sex: 'male' | 'female'): number {
  const band = eer.energyDepositionKcal.find(
    (b) => ageYears >= b.fromAgeYears && ageYears < b.toAgeYears,
  );
  return band ? band[sex] : 0;
}

function equation(input: ChildInput, sex: 'male' | 'female'): number {
  const c: Coefficients = eer.children[sex][NASEM_ACTIVITY[input.activity]];
  return (
    c.intercept +
    c.age * input.ageYears +
    c.height * input.heightCm +
    c.weight * input.weightKg +
    energyDepositionKcal(input.ageYears, sex)
  );
}

/**
 * Estimated energy requirement for children and adolescents 3–18 years (kcal/day), growth included.
 * Source: NASEM, Dietary Reference Intakes for Energy (2023) — research/R01 §5. Unspecified sex → mean of both equations.
 * Returns NaN outside 3 ≤ age < 19: callers must check the age range first.
 */
export function eerChildKcal(input: ChildInput): number {
  if (input.ageYears < EER_CHILD_MIN_AGE_YEARS || input.ageYears >= EER_CHILD_MAX_AGE_YEARS)
    return Number.NaN;
  if (input.sex === 'unspecified') return (equation(input, 'male') + equation(input, 'female')) / 2;
  return equation(input, input.sex);
}
