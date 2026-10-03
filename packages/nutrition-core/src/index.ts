/**
 * @refectorio/nutrition-core — executable specification of Refectorio calculations and safety rules.
 * Pure TypeScript: no UI, no network, no AI. Every number has a source (see data/*.json and README.md).
 */
export { err, ok, type Result } from './result';
export * from './types';
export {
  INPUT_LIMITS,
  validateQuestionnaire,
  type InputError,
  type InputErrorCode,
  type QuestionnaireInput,
} from './input';
export {
  harrisBenedictRevisedKcal,
  katchMcArdleKcal,
  mifflinStJeorKcal,
  schofieldKcal,
  type BodyInput,
} from './energy/bmr';
export {
  EER_CHILD_MAX_AGE_YEARS,
  EER_CHILD_MIN_AGE_YEARS,
  NASEM_ACTIVITY,
  eerChildKcal,
  type ChildInput,
} from './energy/eer';
export {
  CALORIE_FLOOR_KCAL,
  ENERGY_PER_KG_KCAL,
  MIN_PLAUSIBLE_KCAL,
  RATE_PCT_PER_WEEK,
  VLCD_LIMIT_KCAL,
  energyTarget,
  type AdultEnergy,
  type ChildEnergy,
  type EnergyResult,
  type NoEnergy,
} from './energy/target';
export {
  AMDR,
  KCAL_PER_G,
  energyShares,
  fiberTargetG,
  macroTargets,
  proteinGPerKg,
  waterTargetMl,
  type MacroTargets,
} from './macros';
export {
  adultBmiCategory,
  bmiKgM2,
  childBmiCategory,
  lmsValueAtZ,
  lmsZScore,
  type AdultBmiCategory,
  type ChildBmiCategory,
  type Lms,
} from './status';
export {
  AGE_LIMITS,
  GUARDRAIL_STATUSES,
  evaluateGuardrails,
  type DishRule,
  type GuardrailDecision,
  type GuardrailStatus,
  type ReasonCode,
  type Regime,
  type Specialist,
} from './guardrails';
