import data from './data/macros.json';
import type { Goal, Questionnaire } from './types';

/** Energy density used to convert grams and kcal (Atwater factors). */
export const KCAL_PER_G = { protein: 4, carb: 4, fat: 9 } as const;

export type MacroTargets = {
  readonly proteinG: number;
  readonly fatG: number;
  readonly carbG: number;
  /** null below 2 years: no individual fibre target. */
  readonly fiberG: number | null;
  /** Total water including water from food (EFSA). */
  readonly waterMl: number;
  readonly freeSugarsMaxG: number;
  readonly saturatedFatMaxG: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

type Band = { readonly fromAgeYears: number; readonly toAgeYears: number; readonly value: number };
const inBand = (bands: readonly Band[], ageYears: number): number | undefined =>
  bands.find((b) => ageYears >= b.fromAgeYears && ageYears < b.toAgeYears)?.value;

/** Protein in g/kg: adult base raised for older adults and for gain/lose goals (research/R02, C-07, C-08). */
export function proteinGPerKg(ageYears: number, goal: Goal): number {
  const p = data.protein;
  if (ageYears < 18)
    return inBand(p.childGPerKg.bands, ageYears) ?? p.childGPerKg.bands[0]?.value ?? 0;
  let perKg = p.adultGPerKg.value;
  if (ageYears >= p.olderAdultGPerKg.fromAgeYears)
    perKg = Math.max(perKg, p.olderAdultGPerKg.value);
  if (goal === 'gain') perKg = Math.max(perKg, p.gainGPerKg.value);
  if (goal === 'lose') perKg = Math.max(perKg, p.loseGPerKg.value);
  return perKg;
}

export function fiberTargetG(ageYears: number, energyKcal: number): number | null {
  const f = data.fiber;
  if (ageYears >= 18) return Math.max((f.gPer1000Kcal * energyKcal) / 1000, f.adultMinG);
  // No individual numbers before 3 years (algorithm-spec.md §4.3).
  if (ageYears < 3) return null;
  return inBand(f.childBands, ageYears) ?? null;
}

export function waterTargetMl(
  q: Pick<Questionnaire, 'ageYears' | 'sex' | 'pregnancy' | 'lactation'>,
): number {
  const w = data.water;
  const band = w.childBands.find((b) => q.ageYears >= b.fromAgeYears && q.ageYears < b.toAgeYears);
  // Unspecified sex takes the lower (female) value for children, like adults.
  const base = band ? (q.sex === 'male' ? band.male : band.female) : w.adultMl[q.sex];
  const extra = Math.max(
    q.pregnancy !== 'none' ? w.pregnancyExtraMl : 0,
    q.lactation !== 'none' ? w.lactationExtraMl : 0,
  );
  return base + extra;
}

/**
 * Daily macronutrient targets for a given energy target (research/algorithm-spec.md §4.5).
 * Protein first (g/kg), fat 30% of energy, carbohydrates — the rest.
 */
export function macroTargets(
  q: Pick<Questionnaire, 'ageYears' | 'sex' | 'weightKg' | 'pregnancy' | 'lactation'>,
  energyKcal: number,
  goal: Goal,
): MacroTargets {
  const share = data.energyShare;
  // Priority: protein g/kg kept inside 10–35% of energy, carbohydrates at least 45%, fat 30% → down to 20% if needed.
  const proteinShare = clamp(
    (proteinGPerKg(q.ageYears, goal) * q.weightKg * KCAL_PER_G.protein) / energyKcal,
    AMDR.protein[0],
    AMDR.protein[1],
  );
  const fatShare = clamp(1 - proteinShare - AMDR.carb[0], AMDR.fat[0], share.fatTarget);
  const carbShare = 1 - proteinShare - fatShare;
  return {
    proteinG: (proteinShare * energyKcal) / KCAL_PER_G.protein,
    fatG: (fatShare * energyKcal) / KCAL_PER_G.fat,
    carbG: (carbShare * energyKcal) / KCAL_PER_G.carb,
    fiberG: fiberTargetG(q.ageYears, energyKcal),
    waterMl: waterTargetMl(q),
    freeSugarsMaxG:
      q.ageYears < share.noAddedSugarUnderAgeYears
        ? 0
        : (share.freeSugarsMax * energyKcal) / KCAL_PER_G.carb,
    saturatedFatMaxG: (share.saturatedFatMax * energyKcal) / KCAL_PER_G.fat,
  };
}

/** Shares of energy from each macronutrient — used by the menu validator against AMDR ranges. */
export function energyShares(proteinG: number, fatG: number, carbG: number) {
  const total = proteinG * KCAL_PER_G.protein + fatG * KCAL_PER_G.fat + carbG * KCAL_PER_G.carb;
  if (total <= 0) return { protein: 0, fat: 0, carb: 0 };
  return {
    protein: (proteinG * KCAL_PER_G.protein) / total,
    fat: (fatG * KCAL_PER_G.fat) / total,
    carb: (carbG * KCAL_PER_G.carb) / total,
  };
}

const range = (values: readonly number[]): readonly [number, number] => [
  values[0] ?? 0,
  values[1] ?? 0,
];

/** Acceptable macronutrient distribution ranges (shares of energy) for the menu validator. */
export const AMDR = {
  protein: range(data.energyShare.proteinRange),
  fat: range(data.energyShare.fatRange),
  carb: range(data.energyShare.carbRange),
} as const;
