/**
 * Macronutrient corridors by the quiz's «Тип диеты» (macroProfile) — research/stage-2-mappings.md §2, R17 §8, R02.
 * Shares of energy; the menu solver keeps each macronutrient inside [min, max] and near the target.
 */
import type { GuardrailDecision } from './guardrails';
import { bmiKgM2 } from './status';
import { AMDR, KCAL_PER_G, proteinGPerKg } from './macros';
import type { Goal, MacroProfile, Questionnaire } from './types';

export type MacroCorridor = { readonly min: number; readonly target: number; readonly max: number };

export type ProfileMacros = {
  readonly profile: MacroProfile;
  /** Grams per day. */
  readonly proteinG: MacroCorridor;
  readonly fatG: MacroCorridor;
  readonly carbsG: MacroCorridor;
};

/**
 * Profile shares (stage-2-mappings §2.1, R17 §8): fat — EFSA 20–35 % with the project's 30 % target (R17 E6);
 * carbohydrates — EFSA 45–60 % (R17 E7); protein — g/kg inside AMDR 10–35 %.
 */
const SHARES = {
  fatMin: AMDR.fat[0],
  fatTarget: 0.3,
  fatLimit: AMDR.fat[1],
  carbMin: AMDR.carb[0],
  carbMax: 0.6,
  proteinMin: AMDR.protein[0],
  proteinMax: AMDR.protein[1],
  /** ISSN 2017 (R17 §3, S8): 1.4–2.0 g/kg for people who train; highProtein takes 1.6 (stage-2-mappings §2.1). */
  strengthGPerKg: 1.4,
  highProteinGPerKg: 1.6,
  highProteinFat: 0.25,
  /** lowCarb: carbohydrates 40–45 % (ADA 2019 «low-carb» 26–45 %; the 40 % floor — project decision, D-081). */
  lowCarbMin: 0.4,
  lowCarbTarget: 0.45,
  lowCarbProteinMin: 0.22,
  /** keto: carbohydrates < 10 % (ADA 2019 «very low-carb»), protein ≈ 20 % (stage-2-mappings §2.1). */
  ketoCarbMax: 0.1,
  ketoCarbTarget: 0.07,
  ketoProtein: 0.2,
  ketoFatMax: 0.8,
  /** lowFat: fat at the AMDR floor 20 %, carbohydrates ≤ 60 % (R17 §8). */
  lowFatFatMax: 0.25,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The profile the person may follow (stage-2-mappings §2.4): restrictive profiles are not offered to minors, in
 * pregnancy or lactation, with an eating disorder; at BMI < 18.5 only recommended or high-protein; keto never where
 * the guardrails forbid it or from 65 years.
 */
export function effectiveMacroProfile(
  requested: MacroProfile,
  q: Pick<Questionnaire, 'ageYears' | 'heightCm' | 'weightKg' | 'pregnancy' | 'lactation'>,
  decision: Pick<GuardrailDecision, 'deemphasizeNumbers' | 'forbiddenRegimes'>,
): { readonly profile: MacroProfile; readonly adjusted: boolean } {
  const keep = { profile: requested, adjusted: false } as const;
  const fallback = { profile: 'recommended', adjusted: requested !== 'recommended' } as const;
  if (requested === 'recommended') return keep;
  if (
    q.ageYears < 18 ||
    q.pregnancy !== 'none' ||
    q.lactation !== 'none' ||
    decision.deemphasizeNumbers
  )
    return fallback;
  if (bmiKgM2(q.weightKg, q.heightCm) < 18.5 && requested !== 'highProtein') return fallback;
  if (requested === 'keto' && (decision.forbiddenRegimes.includes('keto') || q.ageYears >= 65))
    return fallback;
  return keep;
}

/** Daily macronutrient corridors in grams for an energy target and an (effective) profile. */
export function profileMacros(
  q: Pick<Questionnaire, 'ageYears' | 'weightKg' | 'strengthTraining'>,
  energyKcal: number,
  goal: Goal,
  profile: MacroProfile,
): ProfileMacros {
  const share = (gPerKg: number) => (gPerKg * q.weightKg * KCAL_PER_G.protein) / energyKcal;
  let perKg = proteinGPerKg(q.ageYears, goal);
  if (q.ageYears >= 18 && q.strengthTraining) perKg = Math.max(perKg, SHARES.strengthGPerKg);
  if (profile === 'highProtein') perKg = Math.max(perKg, SHARES.highProteinGPerKg);

  let protein = clamp(share(perKg), SHARES.proteinMin, SHARES.proteinMax);
  let fat: MacroCorridor;
  let carb: MacroCorridor;
  switch (profile) {
    case 'keto': {
      protein = clamp(Math.max(protein, SHARES.ketoProtein), SHARES.proteinMin, SHARES.proteinMax);
      carb = { min: 0, target: SHARES.ketoCarbTarget, max: SHARES.ketoCarbMax };
      const fatTarget = 1 - protein - SHARES.ketoCarbTarget;
      fat = { min: fatTarget - 0.05, target: fatTarget, max: SHARES.ketoFatMax };
      break;
    }
    case 'lowCarb': {
      protein = clamp(
        Math.max(protein, SHARES.lowCarbProteinMin),
        SHARES.proteinMin,
        SHARES.proteinMax,
      );
      carb = { min: SHARES.lowCarbMin, target: SHARES.lowCarbTarget, max: SHARES.lowCarbTarget };
      const fatTarget = clamp(1 - protein - SHARES.lowCarbTarget, SHARES.fatMin, SHARES.fatLimit);
      fat = { min: SHARES.fatMin, target: fatTarget, max: SHARES.fatLimit };
      break;
    }
    case 'lowFat': {
      protein = clamp(
        Math.max(protein, 1 - SHARES.fatMin - SHARES.carbMax),
        SHARES.proteinMin,
        SHARES.proteinMax,
      );
      fat = { min: SHARES.fatMin, target: SHARES.fatMin, max: SHARES.lowFatFatMax };
      carb = { min: SHARES.carbMin, target: 1 - protein - SHARES.fatMin, max: SHARES.carbMax };
      break;
    }
    case 'highProtein':
    case 'recommended': {
      const wanted = profile === 'highProtein' ? SHARES.highProteinFat : SHARES.fatTarget;
      // Fat moves first so that carbohydrates stay inside 45–60 %.
      const fatTarget = clamp(
        clamp(wanted, 1 - protein - SHARES.carbMax, 1 - protein - SHARES.carbMin),
        SHARES.fatMin,
        SHARES.fatLimit,
      );
      fat = { min: SHARES.fatMin, target: fatTarget, max: SHARES.fatLimit };
      carb = { min: SHARES.carbMin, target: 1 - protein - fatTarget, max: SHARES.carbMax };
      break;
    }
  }
  const grams = (c: MacroCorridor, kcalPerG: number): MacroCorridor => ({
    min: (c.min * energyKcal) / kcalPerG,
    target: (c.target * energyKcal) / kcalPerG,
    max: (c.max * energyKcal) / kcalPerG,
  });
  const proteinG = (protein * energyKcal) / KCAL_PER_G.protein;
  return {
    profile,
    proteinG: {
      min: proteinG,
      target: proteinG,
      max: (SHARES.proteinMax * energyKcal) / KCAL_PER_G.protein,
    },
    fatG: grams(fat, KCAL_PER_G.fat),
    carbsG: grams(carb, KCAL_PER_G.carb),
  };
}
