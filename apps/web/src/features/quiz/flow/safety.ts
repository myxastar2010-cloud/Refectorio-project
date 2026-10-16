import {
  activityFromLifestyle,
  AGE_LIMITS,
  evaluateGuardrails,
  validateQuestionnaire,
  type AllergenCode,
  type AllergenLevel,
  type GuardrailDecision,
  type HealthFlag,
  type Lactation,
  type Pregnancy,
  type QuestionnaireInput,
} from '@refectorio/nutrition-core';
import {
  HEALTH_CHIP_IDS,
  type AllergenChipId,
  type HealthChipId,
} from '../../../content/quizSchema';
import { FOOD_STYLE_DIET, type Answers } from './types';

/**
 * Safety rules on partial answers (ТЗ §8.7): guardrails re-run after each relevant answer. Until a value is known a
 * neutral stand-in is used that triggers no rule (BMI 22, moderate activity), so nothing is restricted too early.
 */

/** Women of these ages see the pregnancy and breastfeeding chips (research/stage-2-mappings.md §3.4). */
export const REPRODUCTIVE_AGE = { min: 14, max: 55 } as const;
/** Children 1–13 (family mode): only the conditions that really occur in children (§3.5). */
const CHILD_HEALTH_CHIPS: readonly HealthChipId[] = [
  'diabetes',
  'kidneyDisease',
  'pku',
  'hypothyroidism',
];
const NEUTRAL_BMI = 22;

export function visibleHealthChips(answers: Answers): HealthChipId[] {
  const age = answers.ageYears ?? 30;
  const reproductive =
    answers.sex === 'female' && age >= REPRODUCTIVE_AGE.min && age <= REPRODUCTIVE_AGE.max;
  return HEALTH_CHIP_IDS.filter((chip) => {
    if (age < AGE_LIMITS.childUnderYears) return CHILD_HEALTH_CHIPS.includes(chip);
    if (chip === 'pregnancy' || chip === 'lactation') return reproductive;
    return true;
  });
}

/** Health chips that are active now (the parent said «Да» and the chip is visible). */
export function activeHealthChips(answers: Answers): HealthChipId[] {
  if (answers.health !== 'yes') return [];
  const visible = new Set(visibleHealthChips(answers));
  return answers.healthChips.filter((chip) => visible.has(chip));
}

const DIRECT_FLAGS: Partial<Record<HealthChipId, HealthFlag>> = {
  hypertension: 'hypertension',
  hypothyroidism: 'hypothyroidism',
  insulinResistance: 'insulinResistance',
  kidneyDisease: 'kidneyDisease',
  eatingDisorder: 'eatingDisorderHistory',
  warfarin: 'warfarin',
  maoi: 'maoi',
  pku: 'pku',
};

export function healthFlags(answers: Answers): HealthFlag[] {
  const flags: HealthFlag[] = [];
  for (const chip of activeHealthChips(answers)) {
    const flag = DIRECT_FLAGS[chip];
    if (flag) flags.push(flag);
    // «Не знаю» about insulin takes the safer branch (asymmetric harm, stage-2-mappings §3.1).
    if (chip === 'diabetes')
      flags.push(answers.insulin === 'no' ? 'diabetesType2' : 'diabetesInsulin');
  }
  return flags;
}

export function pregnancyOf(answers: Answers): Pregnancy {
  return activeHealthChips(answers).includes('pregnancy')
    ? (answers.trimester ?? 'trimester1')
    : 'none';
}

export function lactationOf(answers: Answers): Lactation {
  return activeHealthChips(answers).includes('lactation')
    ? (answers.lactationPeriod ?? 'months0to6')
    : 'none';
}

/** Allergen chips → codes and levels (stage-2-mappings §4.1); one level per code, the strictest wins. */
const CHIP_ALLERGEN: Record<AllergenChipId, AllergenCode> = {
  lactose: 'MILK',
  milk: 'MILK',
  gluten: 'GLUTEN',
  peanut: 'PEANUT',
  fish: 'FISH',
  mollusc: 'MOLLUSC',
  soy: 'SOY',
  treeNut: 'TREE_NUT',
  egg: 'EGG',
  crustacean: 'CRUSTACEAN',
  sesame: 'SESAME',
  celery: 'CELERY',
  mustard: 'MUSTARD',
  sulphites: 'SULPHITES',
  lupin: 'LUPIN',
  aspartame: 'ASPARTAME',
};
const LEVEL_RANK: Record<AllergenLevel, number> = { intolerance: 0, allergy: 1, severeAllergy: 2 };

export function allergenItems(answers: Answers): { code: AllergenCode; level: AllergenLevel }[] {
  if (answers.allergy !== 'yes') return [];
  const byCode = new Map<AllergenCode, AllergenLevel>();
  for (const chip of answers.allergenChips) {
    const code = CHIP_ALLERGEN[chip];
    // Lactose is an intolerance: the «even traces» switch does not apply to it.
    const level: AllergenLevel =
      chip === 'lactose' ? 'intolerance' : answers.severeTraces ? 'severeAllergy' : 'allergy';
    const previous = byCode.get(code);
    if (!previous || LEVEL_RANK[level] > LEVEL_RANK[previous]) byCode.set(code, level);
  }
  return [...byCode].map(([code, level]) => ({ code, level }));
}

/** nutrition-core input from (partial) answers. */
export function questionnaireOf(answers: Answers): QuestionnaireInput {
  const age = answers.ageYears ?? 30;
  const height = answers.heightCm ?? 170;
  const weight = answers.weightKg ?? Math.round(NEUTRAL_BMI * (height / 100) ** 2);
  const activity =
    answers.exercise && answers.lifestyle
      ? activityFromLifestyle({
          exercise: answers.exercise,
          lifestyle: answers.lifestyle,
          strengthTraining: answers.strength === 'yes',
          ageYears: age,
        }).group
      : 'kfa2';
  return {
    ageYears: age,
    sex: answers.sex ?? 'unspecified',
    heightCm: height,
    weightKg: weight,
    activity,
    goal: answers.goal ?? 'maintain',
    pregnancy: pregnancyOf(answers),
    lactation: lactationOf(answers),
    mode: age < AGE_LIMITS.childUnderYears && answers.familyConfirmed ? 'family' : 'self',
    health: healthFlags(answers),
    allergens: allergenItems(answers),
    diet: answers.foodStyle ? FOOD_STYLE_DIET[answers.foodStyle] : 'omnivore',
    macroProfile: answers.macroProfile ?? 'recommended',
    strengthTraining: answers.strength === 'yes',
  };
}

export type Safety = {
  readonly decision: GuardrailDecision;
  /** False while height/weight make an implausible BMI (a typo): the step shows «Проверьте рост и вес». */
  readonly plausible: boolean;
};

export function safetyOf(answers: Answers): Safety {
  const input = questionnaireOf(answers);
  const valid = validateQuestionnaire(input);
  if (valid.ok) return { decision: evaluateGuardrails(valid.value), plausible: true };
  // An implausible BMI is reported to the person; the decision is computed on the neutral stand-in meanwhile.
  const plausible = !valid.error.some((e) => e.code === 'IMPLAUSIBLE_BMI');
  const fallback = validateQuestionnaire({
    ...input,
    weightKg: Math.round(NEUTRAL_BMI * (input.heightCm / 100) ** 2),
  });
  if (!fallback.ok) throw new Error('quiz answers outside the nutrition-core ranges');
  return { decision: evaluateGuardrails(fallback.value), plausible };
}

export const ketoAllowed = (decision: GuardrailDecision) =>
  !decision.forbiddenRegimes.includes('keto');
