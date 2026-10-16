/** Domain types of the questionnaire and calculations (research/algorithm-spec.md §2). */

export const SEXES = ['male', 'female', 'unspecified'] as const;
export type Sex = (typeof SEXES)[number];

/** Physical activity groups (КФА) of МР 2.3.1.0253-21; children map them to NASEM categories. */
export const ACTIVITY_GROUPS = ['kfa1', 'kfa2', 'kfa3', 'kfa4'] as const;
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

export const GOALS = ['maintain', 'lose', 'gain', 'habits'] as const;
export type Goal = (typeof GOALS)[number];

export const PREGNANCY_STATES = ['none', 'trimester1', 'trimester2', 'trimester3'] as const;
export type Pregnancy = (typeof PREGNANCY_STATES)[number];

export const LACTATION_STATES = ['none', 'months0to6', 'months7to12'] as const;
export type Lactation = (typeof LACTATION_STATES)[number];

export const MODES = ['self', 'family'] as const;
export type Mode = (typeof MODES)[number];

/** Health answers as fixed flags, never free text (R13); the quiz chips map onto them (research/stage-2-mappings.md). */
export const HEALTH_FLAGS = [
  'diabetesInsulin',
  'diabetesType2',
  'kidneyDisease',
  'pku',
  'eatingDisorderHistory',
  'warfarin',
  'maoi',
  'hypertension',
  'hypothyroidism',
  'insulinResistance',
] as const;
export type HealthFlag = (typeof HEALTH_FLAGS)[number];

/** 15 allergen codes: TR TS 022/2011 p. 14 part 4.4 ∪ EU 1169/2011 annex II (research/R07). */
export const ALLERGEN_CODES = [
  'GLUTEN',
  'CRUSTACEAN',
  'MOLLUSC',
  'FISH',
  'EGG',
  'MILK',
  'TREE_NUT',
  'PEANUT',
  'SOY',
  'CELERY',
  'MUSTARD',
  'SESAME',
  'SULPHITES',
  'LUPIN',
  'ASPARTAME',
] as const;
export type AllergenCode = (typeof ALLERGEN_CODES)[number];

export const ALLERGEN_LEVELS = ['intolerance', 'allergy', 'severeAllergy'] as const;
export type AllergenLevel = (typeof ALLERGEN_LEVELS)[number];

export const DIETS = [
  'omnivore',
  /** Plants, fish, seafood, eggs and dairy; no meat or poultry (R06, stage-2-mappings §1). */
  'pescatarian',
  'vegetarianLactoOvo',
  'vegetarianLacto',
  'vegetarianOvo',
  'vegan',
  'lentLay',
  'halal',
  'kosher',
] as const;
export type Diet = (typeof DIETS)[number];

export type Budget = 'economy' | 'medium' | 'unlimited';

/**
 * The quiz's «Тип диеты». Stage 2 only stores it (and offers no keto when the guardrails forbid it); how a profile
 * changes the macro targets is a stage-3 decision (research/stage-2-mappings.md §2: low-carb and keto fall outside the
 * AMDR ranges of R02).
 */
export const MACRO_PROFILES = ['recommended', 'highProtein', 'lowCarb', 'keto', 'lowFat'] as const;
export type MacroProfile = (typeof MACRO_PROFILES)[number];

/** «Какой у вас уровень физической активности?» — sports sessions per week. */
export const EXERCISE_FREQUENCIES = ['none', '1to2', '3to4', '5to6', 'daily'] as const;
export type ExerciseFrequency = (typeof EXERCISE_FREQUENCIES)[number];

/** «Какой у вас образ жизни?» — movement during an ordinary day. */
export const LIFESTYLES = [
  'mostlySitting',
  'sometimesStanding',
  'mostlyStanding',
  'movingAllDay',
  'physicalLabour',
] as const;
export type Lifestyle = (typeof LIFESTYLES)[number];

export type Questionnaire = {
  readonly ageYears: number;
  readonly sex: Sex;
  readonly heightCm: number;
  readonly weightKg: number;
  readonly bodyFatPct?: number;
  readonly activity: ActivityGroup;
  readonly goal: Goal;
  readonly ratePctPerWeek?: number;
  readonly pregnancy: Pregnancy;
  readonly lactation: Lactation;
  readonly mode: Mode;
  readonly health: readonly HealthFlag[];
  readonly edScreenPositive: boolean;
  readonly allergens: readonly { readonly code: AllergenCode; readonly level: AllergenLevel }[];
  readonly diet: Diet;
  readonly mealsPerDay: number;
  readonly cookTimeMaxMin?: number;
  readonly budget: Budget;
  readonly dislikes: readonly string[];
  readonly dislikesOther?: string;
  /** Stored for stage 3; the macro math does not use it yet. */
  readonly macroProfile: MacroProfile;
  /** Strength training: stage 3 uses it for the protein target (ISSN 1.4–2.0 g/kg). */
  readonly strengthTraining: boolean;
  /**
   * Free text the person typed (health conditions, allergies outside the list, notes). Untrusted data for the
   * stage-3 AI (R11): never instructions, never interpreted into flags here.
   */
  readonly healthOther: readonly string[];
  readonly allergensOther: readonly string[];
  readonly notes?: string;
};
