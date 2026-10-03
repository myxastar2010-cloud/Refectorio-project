import mr from '../data/mr-2021-energy.json';
import type { GuardrailDecision } from '../guardrails';
import type { Goal, Questionnaire, Sex } from '../types';
import { katchMcArdleKcal, mifflinStJeorKcal } from './bmr';
import { eerChildKcal } from './eer';

/** Energy content of body-weight change. Source: Wishnofsky 1958 (3500 kcal/lb); limits — Hall 2011 (research/R04 §1). */
export const ENERGY_PER_KG_KCAL = 7700;

/** Weekly rate of change in % of body weight (research/R04 §2). */
export const RATE_PCT_PER_WEEK = {
  lose: { default: 0.5, max: 1 },
  gain: { default: 0.25, max: 0.5 },
} as const;

/** Lowest daily target without a doctor. Source: AHA/ACC/TOS 2013, table 4, rec. 3a (research/R04 §3, C-14). */
export const CALORIE_FLOOR_KCAL: Readonly<Record<Sex, number>> = {
  female: 1200,
  male: 1500,
  unspecified: 1500,
};

/** Very-low-calorie diets (< 800 kcal) need medical supervision — never produced automatically (AHA/ACC/TOS 2013, rec. 4e). */
export const VLCD_LIMIT_KCAL = 800;

export const MINOR_UNDER_YEARS = 18;

export type AdultEnergy = {
  readonly kind: 'adult';
  readonly method: 'mifflinStJeor' | 'katchMcArdle';
  readonly bmrKcal: number;
  readonly pal: number;
  readonly extraKcal: number;
  readonly tdeeKcal: number;
  /** Goal actually used; differs from the requested one if guardrails do not allow it. */
  readonly goal: Goal;
  readonly goalAdjusted: boolean;
  readonly ratePctPerWeek: number;
  readonly rateCapped: boolean;
  readonly floorApplied: boolean;
  readonly targetKcal: number;
};

export type ChildEnergy = {
  readonly kind: 'child';
  readonly method: 'eerNasem2023';
  readonly eerKcal: number;
  readonly extraKcal: number;
  readonly targetKcal: number;
};

export type NoEnergy = { readonly kind: 'none'; readonly reason: 'refused' | 'noIndividualEnergy' };

export type EnergyResult = AdultEnergy | ChildEnergy | NoEnergy;

const kcalPerDayForRate = (ratePct: number, weightKg: number): number =>
  ((ratePct / 100) * weightKg * ENERGY_PER_KG_KCAL) / 7;

/** Pregnancy and lactation add the larger of the two МР allowances, only when the user chose them explicitly (C-12). */
function reproductiveExtraKcal(q: Questionnaire): number {
  return Math.max(mr.pregnancyExtraKcal[q.pregnancy], mr.lactationExtraKcal[q.lactation]);
}

function adultEnergy(q: Questionnaire, decision: GuardrailDecision): AdultEnergy {
  const method: AdultEnergy['method'] =
    q.bodyFatPct === undefined ? 'mifflinStJeor' : 'katchMcArdle';
  const bmrKcal =
    q.bodyFatPct === undefined
      ? mifflinStJeorKcal(q)
      : katchMcArdleKcal({ weightKg: q.weightKg, bodyFatPct: q.bodyFatPct });
  // МР gives one PAL (1.7) for 65+; active older adults keep their group PAL so energy is not underestimated (D-016).
  const groupPal = mr.palByActivityGroup[q.activity];
  const pal =
    q.ageYears >= mr.olderAdultsFromAgeYears ? Math.max(mr.palOlderAdults, groupPal) : groupPal;
  const extraKcal = reproductiveExtraKcal(q);
  const tdeeKcal = bmrKcal * pal + extraKcal;

  const goal: Goal = decision.allowedGoals.includes(q.goal) ? q.goal : 'maintain';
  const base = {
    kind: 'adult' as const,
    method,
    bmrKcal,
    pal,
    extraKcal,
    tdeeKcal,
    goal,
    goalAdjusted: goal !== q.goal,
  };

  if (goal === 'lose' && decision.energyDeficitAllowed) {
    const requested = q.ratePctPerWeek ?? RATE_PCT_PER_WEEK.lose.default;
    const rate = Math.min(requested, RATE_PCT_PER_WEEK.lose.max);
    const floor = CALORIE_FLOOR_KCAL[q.sex];
    const wanted = tdeeKcal - kcalPerDayForRate(rate, q.weightKg);
    // The floor never turns a deficit into a surplus: if maintenance is already below it, the target is maintenance.
    const targetKcal = wanted < floor ? Math.min(tdeeKcal, floor) : wanted;
    return {
      ...base,
      ratePctPerWeek: ((tdeeKcal - targetKcal) * 7 * 100) / (ENERGY_PER_KG_KCAL * q.weightKg),
      rateCapped: requested > rate,
      floorApplied: wanted < floor,
      targetKcal,
    };
  }
  if (goal === 'gain' && decision.energySurplusAllowed) {
    const requested = q.ratePctPerWeek ?? RATE_PCT_PER_WEEK.gain.default;
    const rate = Math.min(requested, RATE_PCT_PER_WEEK.gain.max);
    return {
      ...base,
      ratePctPerWeek: rate,
      rateCapped: requested > rate,
      floorApplied: false,
      targetKcal: tdeeKcal + kcalPerDayForRate(rate, q.weightKg),
    };
  }
  return {
    ...base,
    ratePctPerWeek: 0,
    rateCapped: false,
    floorApplied: false,
    targetKcal: tdeeKcal,
  };
}

/**
 * Daily energy target (research/algorithm-spec.md §4). Children and adolescents get their requirement
 * without any deficit or surplus; ages under 3 and refused cases get no individual number.
 */
export function energyTarget(q: Questionnaire, decision: GuardrailDecision): EnergyResult {
  if (decision.status === 'refused') return { kind: 'none', reason: 'refused' };
  if (!decision.individualEnergy) return { kind: 'none', reason: 'noIndividualEnergy' };
  if (q.ageYears < MINOR_UNDER_YEARS) {
    const eerKcal = eerChildKcal(q);
    const extraKcal = reproductiveExtraKcal(q);
    return {
      kind: 'child',
      method: 'eerNasem2023',
      eerKcal,
      extraKcal,
      targetKcal: eerKcal + extraKcal,
    };
  }
  return adultEnergy(q, decision);
}
