/** Domain types of the questionnaire and calculations (research/algorithm-spec.md §2). */

export type Sex = 'male' | 'female' | 'unspecified';

/** Physical activity groups (КФА) of МР 2.3.1.0253-21; children map them to NASEM categories. */
export type ActivityGroup = 'kfa1' | 'kfa2' | 'kfa3' | 'kfa4';

export type Goal = 'maintain' | 'lose' | 'gain' | 'habits';

export type Pregnancy = 'none' | 'trimester1' | 'trimester2' | 'trimester3';

export type Lactation = 'none' | 'months0to6' | 'months7to12';

export type Mode = 'self' | 'family';

export type HealthFlag =
  | 'diabetesInsulin'
  | 'diabetesType2'
  | 'kidneyDisease'
  | 'pku'
  | 'eatingDisorderHistory'
  | 'warfarin'
  | 'maoi';

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

export type AllergenLevel = 'intolerance' | 'allergy' | 'severeAllergy';

export type Diet =
  | 'omnivore'
  | 'vegetarianLactoOvo'
  | 'vegetarianLacto'
  | 'vegetarianOvo'
  | 'vegan'
  | 'lentLay'
  | 'halal'
  | 'kosher';

export type Budget = 'economy' | 'medium' | 'unlimited';

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
};
