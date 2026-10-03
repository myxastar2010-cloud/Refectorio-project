/** Nutritional status (research/R05, algorithm-spec.md §4.7). */

export const bmiKgM2 = (weightKg: number, heightCm: number): number =>
  weightKg / (heightCm / 100) ** 2;

export type AdultBmiCategory =
  'underweight' | 'normal' | 'preobese' | 'obesityClass1' | 'obesityClass2' | 'obesityClass3';

/** WHO adult BMI classification (cut-offs in kg/m²). Source: WHO, research/R05 §1. */
const ADULT_BMI_CUTOFFS: readonly {
  readonly below: number;
  readonly category: AdultBmiCategory;
}[] = [
  { below: 18.5, category: 'underweight' },
  { below: 25, category: 'normal' },
  { below: 30, category: 'preobese' },
  { below: 35, category: 'obesityClass1' },
  { below: 40, category: 'obesityClass2' },
];

/** For adults (18+) only; children and adolescents are assessed with BMI-for-age z-scores. */
export function adultBmiCategory(bmi: number): AdultBmiCategory {
  return ADULT_BMI_CUTOFFS.find((c) => bmi < c.below)?.category ?? 'obesityClass3';
}

/** L, M, S parameters of a WHO growth reference for one sex and age. */
export type Lms = { readonly l: number; readonly m: number; readonly s: number };

/** Measurement value at a given z-score for the LMS distribution. */
export function lmsValueAtZ({ l, m, s }: Lms, z: number): number {
  return l === 0 ? m * Math.exp(s * z) : m * (1 + l * s * z) ** (1 / l);
}

/**
 * BMI-for-age z-score with the WHO restricted application of the LMS method:
 * |z| ≤ 3 → classic LMS; beyond ±3 SD the distance is measured in units of the 2–3 SD interval.
 * Source: WHO Child Growth Standards / Growth Reference 2007 documentation (research/R05 §2).
 * The LMS tables themselves are licensed CC BY-NC-SA 3.0 IGO and are NOT bundled (decision D-010):
 * the caller supplies L, M, S.
 */
export function lmsZScore(value: number, lms: Lms): number {
  const { l, m, s } = lms;
  const z = l === 0 ? Math.log(value / m) / s : ((value / m) ** l - 1) / (s * l);
  if (z > 3) {
    const sd3 = lmsValueAtZ(lms, 3);
    const sd2 = lmsValueAtZ(lms, 2);
    return 3 + (value - sd3) / (sd3 - sd2);
  }
  if (z < -3) {
    const sd3neg = lmsValueAtZ(lms, -3);
    const sd2neg = lmsValueAtZ(lms, -2);
    return -3 + (value - sd3neg) / (sd2neg - sd3neg);
  }
  return z;
}

export type ChildBmiCategory = 'severeThinness' | 'thinness' | 'normal' | 'overweight' | 'obesity';

/** WHO 2007 cut-offs for 5–19 years. Shown to adults (family mode) only, in neutral wording. */
export function childBmiCategory(z: number): ChildBmiCategory {
  if (z < -3) return 'severeThinness';
  if (z < -2) return 'thinness';
  if (z <= 1) return 'normal';
  if (z <= 2) return 'overweight';
  return 'obesity';
}
