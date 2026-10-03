import type { Sex } from '../types';

/** Inputs of the adult resting-energy equations (kcal/day). */
export type BodyInput = {
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly sex: Sex;
};

/** Average of the male and female variants — used when sex is not specified (research/conflicts.md C-15). */
const bySex = (sex: Sex, male: number, female: number): number =>
  sex === 'male' ? male : sex === 'female' ? female : (male + female) / 2;

/**
 * Mifflin–St Jeor (1990), original coefficients: 9.99·kg + 6.25·cm − 4.92·years + 166·male − 161
 * (s = +5 for men, −161 for women). The popular rounded form (10, 6.25, 5) differs by 1–3 kcal.
 * Source: Mifflin MD et al. Am J Clin Nutr 1990;51:241–7, doi:10.1093/ajcn/51.2.241; fact-check A-01.
 */
export function mifflinStJeorKcal({ weightKg, heightCm, ageYears, sex }: BodyInput): number {
  return 9.99 * weightKg + 6.25 * heightCm - 4.92 * ageYears + bySex(sex, 5, -161);
}

/**
 * Harris–Benedict revised by Roza & Shizgal (1984). Kept for cross-checks, not the default.
 * Source: Roza AM, Shizgal HM. Am J Clin Nutr 1984;40:168–82 (research/R01 §1).
 */
export function harrisBenedictRevisedKcal({
  weightKg,
  heightCm,
  ageYears,
  sex,
}: BodyInput): number {
  const male = 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * ageYears;
  const female = 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * ageYears;
  return bySex(sex, male, female);
}

/**
 * Katch–McArdle (= Cunningham 1991): 370 + 21.6 · lean body mass (kg). Used when body fat % is known.
 * Source: research/R01 §1 (Katch & McArdle; Cunningham JJ, Am J Clin Nutr 1991).
 */
export function katchMcArdleKcal({
  weightKg,
  bodyFatPct,
}: {
  weightKg: number;
  bodyFatPct: number;
}): number {
  const leanMassKg = weightKg * (1 - bodyFatPct / 100);
  return 370 + 21.6 * leanMassKg;
}

type SchofieldBand = {
  readonly toAgeYears: number;
  readonly male: [number, number];
  readonly female: [number, number];
};

/** Schofield (1985) weight-only equations as tabulated by FAO/WHO/UNU 2004, table 5.2: [slope, intercept]. */
const SCHOFIELD: readonly SchofieldBand[] = [
  { toAgeYears: 3, male: [59.512, -30.4], female: [58.317, -31.1] },
  { toAgeYears: 10, male: [22.706, 504.3], female: [20.315, 485.9] },
  { toAgeYears: 18, male: [17.686, 658.2], female: [13.384, 692.6] },
  { toAgeYears: 30, male: [15.057, 692.2], female: [14.818, 486.6] },
  { toAgeYears: 60, male: [11.472, 873.1], female: [8.126, 845.6] },
  { toAgeYears: Number.POSITIVE_INFINITY, male: [11.711, 587.7], female: [9.082, 658.5] },
];

/** Schofield BMR (kcal/day), reference only. Source: FAO/WHO/UNU 2004 (research/R01 §1). */
export function schofieldKcal({ weightKg, ageYears, sex }: Omit<BodyInput, 'heightCm'>): number {
  // The last band is open-ended, so only a NaN age finds nothing.
  const band = SCHOFIELD.find((b) => ageYears < b.toAgeYears);
  if (!band) return Number.NaN;
  const value = (coeffs: [number, number]): number => coeffs[0] * weightKg + coeffs[1];
  return bySex(sex, value(band.male), value(band.female));
}
