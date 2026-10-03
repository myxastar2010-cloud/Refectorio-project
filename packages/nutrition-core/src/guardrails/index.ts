import { bmiKgM2 } from '../status';
import type { Goal, Questionnaire } from '../types';

/**
 * Safety rules that run before any calculation (research/algorithm-spec.md §5, R08, decision D-009).
 * The decision cannot be overridden by the AI or the solver.
 */

/** From least to most restrictive; the final status is the most restrictive triggered one. */
export const GUARDRAIL_STATUSES = [
  'allowed',
  'requiresDoctor',
  'limited',
  'requiresAdult',
  'refused',
] as const;
export type GuardrailStatus = (typeof GUARDRAIL_STATUSES)[number];

export type ReasonCode =
  | 'AGE_UNDER_1'
  | 'CHILD_NEEDS_ADULT'
  | 'CHILD_FAMILY_MODE'
  | 'TODDLER_NO_INDIVIDUAL_ENERGY'
  | 'TEEN_NO_ENERGY_GOALS'
  | 'PREGNANCY'
  | 'LACTATION'
  | 'DIABETES_INSULIN'
  | 'DIABETES_TYPE2'
  | 'KIDNEY_DISEASE'
  | 'PKU'
  | 'WARFARIN'
  | 'MAOI'
  | 'ED_SCREEN_POSITIVE'
  | 'ED_HISTORY'
  | 'BMI_UNDERWEIGHT'
  | 'OLDER_ADULT_CAUTION';

export type Specialist =
  | 'pediatrician'
  | 'obstetrician'
  | 'endocrinologist'
  | 'nephrologist'
  | 'geneticist'
  | 'mentalHealth'
  | 'gp';

export type Regime = 'intermittentFasting' | 'keto' | 'vlcd';
export type DishRule = 'stableVitaminK' | 'excludeHighTyramine';

export type GuardrailDecision = {
  readonly status: GuardrailStatus;
  readonly reasons: readonly ReasonCode[];
  readonly referToDoctor: readonly Specialist[];
  readonly allowedGoals: readonly Goal[];
  readonly energyDeficitAllowed: boolean;
  readonly energySurplusAllowed: boolean;
  /** Eating-disorder safety: weight and calories are not the focus of the interface. */
  readonly deemphasizeNumbers: boolean;
  readonly forbiddenRegimes: readonly Regime[];
  readonly dishRules: readonly DishRule[];
  /** 14–17: data stays in the browser only (D-009). */
  readonly guestOnly: boolean;
  /** Ages 1–2: no individual energy calculation (R01). */
  readonly individualEnergy: boolean;
};

export const AGE_LIMITS = {
  infantUnderYears: 1,
  toddlerUnderYears: 3,
  childUnderYears: 14,
  minorUnderYears: 18,
  olderAdultFromYears: 65,
} as const;

export const BMI_UNDERWEIGHT_BELOW = 18.5;
export const BMI_OBESITY_FROM = 30;

const ALL_GOALS: readonly Goal[] = ['maintain', 'lose', 'gain', 'habits'];
const NO_ENERGY_GOALS: readonly Goal[] = ['maintain', 'habits'];
const NO_DIETS: readonly Regime[] = ['intermittentFasting', 'keto', 'vlcd'];

/** What a single rule contributes; everything is merged into one decision. */
type Effect = {
  status: GuardrailStatus;
  reason: ReasonCode;
  refer?: Specialist[];
  goals?: readonly Goal[];
  noDeficit?: boolean;
  noSurplus?: boolean;
  deemphasizeNumbers?: boolean;
  forbid?: readonly Regime[];
  dishRules?: DishRule[];
  guestOnly?: boolean;
  noIndividualEnergy?: boolean;
};

function ageEffects(q: Questionnaire): Effect[] {
  const age = q.ageYears;
  if (age < AGE_LIMITS.infantUnderYears) {
    return [{ status: 'refused', reason: 'AGE_UNDER_1', refer: ['pediatrician'], goals: [] }];
  }
  if (age < AGE_LIMITS.childUnderYears) {
    const effects: Effect[] = [
      q.mode === 'family'
        ? {
            status: 'limited',
            reason: 'CHILD_FAMILY_MODE',
            goals: NO_ENERGY_GOALS,
            noDeficit: true,
            noSurplus: true,
          }
        : {
            status: 'requiresAdult',
            reason: 'CHILD_NEEDS_ADULT',
            goals: NO_ENERGY_GOALS,
            noDeficit: true,
            noSurplus: true,
          },
    ];
    if (age < AGE_LIMITS.toddlerUnderYears) {
      effects.push({
        status: 'limited',
        reason: 'TODDLER_NO_INDIVIDUAL_ENERGY',
        refer: ['pediatrician'],
        noIndividualEnergy: true,
      });
    }
    return effects;
  }
  if (age < AGE_LIMITS.minorUnderYears) {
    return [
      {
        status: 'limited',
        reason: 'TEEN_NO_ENERGY_GOALS',
        goals: NO_ENERGY_GOALS,
        noDeficit: true,
        noSurplus: true,
        forbid: NO_DIETS,
        guestOnly: true,
      },
    ];
  }
  return [];
}

function reproductiveEffects(q: Questionnaire): Effect[] {
  const effects: Effect[] = [];
  if (q.pregnancy !== 'none') {
    // "gain" means following the pregnancy norms, not an extra surplus.
    effects.push({
      status: 'limited',
      reason: 'PREGNANCY',
      refer: ['obstetrician'],
      goals: ['maintain', 'gain', 'habits'],
      noDeficit: true,
      noSurplus: true,
      forbid: NO_DIETS,
    });
  }
  if (q.lactation !== 'none') {
    effects.push({
      status: 'limited',
      reason: 'LACTATION',
      refer: ['obstetrician'],
      goals: NO_ENERGY_GOALS,
      noDeficit: true,
      noSurplus: true,
      forbid: NO_DIETS,
    });
  }
  return effects;
}

function healthEffects(q: Questionnaire): Effect[] {
  const has = (flag: Questionnaire['health'][number]): boolean => q.health.includes(flag);
  const effects: Effect[] = [];
  if (has('diabetesInsulin')) {
    effects.push({
      status: 'refused',
      reason: 'DIABETES_INSULIN',
      refer: ['endocrinologist'],
      goals: [],
    });
  }
  if (has('diabetesType2')) {
    effects.push({
      status: 'limited',
      reason: 'DIABETES_TYPE2',
      refer: ['endocrinologist'],
      goals: NO_ENERGY_GOALS,
      noDeficit: true,
      noSurplus: true,
      forbid: ['intermittentFasting', 'keto', 'vlcd'],
    });
  }
  if (has('kidneyDisease')) {
    effects.push({
      status: 'refused',
      reason: 'KIDNEY_DISEASE',
      refer: ['nephrologist'],
      goals: [],
    });
  }
  if (has('pku')) {
    effects.push({ status: 'refused', reason: 'PKU', refer: ['geneticist'], goals: [] });
  }
  if (has('warfarin')) {
    effects.push({
      status: 'limited',
      reason: 'WARFARIN',
      refer: ['gp'],
      dishRules: ['stableVitaminK'],
    });
  }
  if (has('maoi')) {
    effects.push({
      status: 'limited',
      reason: 'MAOI',
      refer: ['gp'],
      dishRules: ['excludeHighTyramine'],
    });
  }
  const edCommon = {
    status: 'limited' as const,
    goals: NO_ENERGY_GOALS,
    noDeficit: true,
    noSurplus: true,
    deemphasizeNumbers: true,
    forbid: NO_DIETS,
  };
  if (has('eatingDisorderHistory')) {
    effects.push({ ...edCommon, reason: 'ED_HISTORY', refer: ['mentalHealth'] });
  }
  if (q.edScreenPositive) {
    effects.push({ ...edCommon, reason: 'ED_SCREEN_POSITIVE', refer: ['mentalHealth'] });
  }
  return effects;
}

function bodyEffects(q: Questionnaire): Effect[] {
  if (q.ageYears < AGE_LIMITS.minorUnderYears) return [];
  const bmi = bmiKgM2(q.weightKg, q.heightCm);
  const effects: Effect[] = [];
  if (bmi < BMI_UNDERWEIGHT_BELOW) {
    effects.push({
      status: 'requiresDoctor',
      reason: 'BMI_UNDERWEIGHT',
      refer: ['gp'],
      goals: ['maintain', 'gain', 'habits'],
      noDeficit: true,
    });
  }
  const older = q.ageYears >= AGE_LIMITS.olderAdultFromYears;
  if (older && (bmi < BMI_UNDERWEIGHT_BELOW || bmi >= BMI_OBESITY_FROM || q.goal === 'lose')) {
    effects.push({ status: 'requiresDoctor', reason: 'OLDER_ADULT_CAUTION', refer: ['gp'] });
  }
  return effects;
}

const rank = (status: GuardrailStatus): number => GUARDRAIL_STATUSES.indexOf(status);

/** Evaluates every rule and merges the effects: the strictest status wins, restrictions accumulate. */
export function evaluateGuardrails(q: Questionnaire): GuardrailDecision {
  const effects = [
    ...ageEffects(q),
    ...reproductiveEffects(q),
    ...healthEffects(q),
    ...bodyEffects(q),
  ];

  let status: GuardrailStatus = 'allowed';
  let goals: readonly Goal[] = ALL_GOALS;
  const refer = new Set<Specialist>();
  const forbid = new Set<Regime>();
  const dishRules = new Set<DishRule>();
  for (const effect of effects) {
    if (rank(effect.status) > rank(status)) status = effect.status;
    if (effect.goals) {
      const allowed = effect.goals;
      goals = goals.filter((goal) => allowed.includes(goal));
    }
    effect.refer?.forEach((s) => refer.add(s));
    effect.forbid?.forEach((r) => forbid.add(r));
    effect.dishRules?.forEach((r) => dishRules.add(r));
  }

  return {
    status,
    reasons: effects.map((e) => e.reason),
    referToDoctor: [...refer],
    allowedGoals: goals,
    energyDeficitAllowed: !effects.some((e) => e.noDeficit),
    energySurplusAllowed: !effects.some((e) => e.noSurplus),
    deemphasizeNumbers: effects.some((e) => e.deemphasizeNumbers),
    forbiddenRegimes: [...forbid],
    dishRules: [...dishRules],
    guestOnly: effects.some((e) => e.guestOnly),
    individualEnergy: !effects.some((e) => e.noIndividualEnergy) && status !== 'refused',
  };
}
