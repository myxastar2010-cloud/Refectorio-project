import { DECISIVE_ANSWERS_REQUIRED, decisiveCount } from '@refectorio/contracts';
import { AGE_LIMITS, cleanItems } from '@refectorio/nutrition-core';
import { activeHealthChips } from './safety';
import type { Answers, StepId } from './types';

/**
 * The quiz as data (ТЗ §13): order (D-031), progress slot, kind, branching and completeness. Pure — unit-tested.
 * Slots: the 11 main questions; a sub-step sits in its parent's slot (+½).
 */
export type StepKind = 'taste' | 'rows' | 'options' | 'yesNo' | 'chips' | 'text';

export type IconKey =
  | 'q-body'
  | 'q-goal'
  | 'q-food-style'
  | 'q-macro'
  | 'q-health'
  | 'q-allergy'
  | 'q-activity'
  | 'q-strength'
  | 'q-lifestyle'
  | 'q-notes';

export type StepDef = {
  readonly id: StepId;
  readonly kind: StepKind;
  readonly slot: number;
  readonly sub: boolean;
  /** Header icon (the Tinder step has none). A sub-step usually shares its parent's icon: it then stays still. */
  readonly icon: IconKey | null;
  readonly showIf?: (answers: Answers) => boolean;
  /** The answer is complete enough to continue. */
  readonly complete: (answers: Answers) => boolean;
};

export const TOTAL_SLOTS = 11;

const has = <T>(value: T | undefined): value is T => value !== undefined;
const isAdultOrConfirmed = (a: Answers) =>
  has(a.ageYears) && (a.ageYears >= AGE_LIMITS.childUnderYears || a.familyConfirmed);

export const STEPS: readonly StepDef[] = [
  {
    id: 'taste',
    kind: 'taste',
    slot: 0,
    sub: false,
    icon: null,
    complete: (a) =>
      a.tasteExhausted || decisiveCount(a.tasteDecisions) >= DECISIVE_ANSWERS_REQUIRED,
  },
  {
    id: 'body',
    kind: 'rows',
    slot: 1,
    sub: false,
    icon: 'q-body',
    complete: (a) => has(a.sex) && has(a.heightCm) && isAdultOrConfirmed(a),
  },
  {
    id: 'goal',
    kind: 'options',
    slot: 2,
    sub: false,
    icon: 'q-goal',
    complete: (a) => has(a.goal),
  },
  {
    id: 'goalSetup',
    kind: 'rows',
    slot: 2,
    sub: true,
    icon: 'q-goal',
    complete: (a) => has(a.weightKg) && (a.goal === 'maintain' || has(a.targetWeightKg)),
  },
  {
    id: 'foodStyle',
    kind: 'options',
    slot: 3,
    sub: false,
    icon: 'q-food-style',
    complete: (a) => has(a.foodStyle),
  },
  {
    id: 'macroProfile',
    kind: 'options',
    slot: 4,
    sub: false,
    icon: 'q-macro',
    complete: (a) => has(a.macroProfile),
  },
  {
    id: 'health',
    kind: 'yesNo',
    slot: 5,
    sub: false,
    icon: 'q-health',
    complete: (a) => has(a.health),
  },
  {
    id: 'healthConditions',
    kind: 'chips',
    slot: 5,
    sub: true,
    icon: 'q-health',
    showIf: (a) => a.health === 'yes',
    complete: (a) => {
      const chips = activeHealthChips(a);
      if (chips.length === 0 && cleanItems(a.healthCustom).length === 0) return false;
      if (chips.includes('diabetes') && !has(a.insulin)) return false;
      if (chips.includes('pregnancy') && !has(a.trimester)) return false;
      if (chips.includes('lactation') && !has(a.lactationPeriod)) return false;
      return true;
    },
  },
  {
    id: 'allergy',
    kind: 'yesNo',
    slot: 6,
    sub: false,
    icon: 'q-allergy',
    complete: (a) => has(a.allergy),
  },
  {
    id: 'allergens',
    kind: 'chips',
    slot: 6,
    sub: true,
    icon: 'q-allergy',
    showIf: (a) => a.allergy === 'yes',
    complete: (a) => a.allergenChips.length > 0 || cleanItems(a.allergenCustom).length > 0,
  },
  // «Неприязнь» shares the allergy icon (the team gave the same file): it stays still between 7 and 8.
  {
    id: 'dislikes',
    kind: 'yesNo',
    slot: 7,
    sub: false,
    icon: 'q-allergy',
    complete: (a) => has(a.dislikes),
  },
  {
    id: 'dislikesText',
    kind: 'text',
    slot: 7,
    sub: true,
    icon: 'q-allergy',
    showIf: (a) => a.dislikes === 'yes',
    complete: (a) => a.dislikesText.trim().length > 0,
  },
  {
    id: 'activity',
    kind: 'options',
    slot: 8,
    sub: false,
    icon: 'q-activity',
    complete: (a) => has(a.exercise),
  },
  {
    id: 'strength',
    kind: 'yesNo',
    slot: 8,
    sub: true,
    icon: 'q-strength',
    showIf: (a) => has(a.exercise) && a.exercise !== 'none',
    complete: (a) => has(a.strength),
  },
  {
    id: 'lifestyle',
    kind: 'options',
    slot: 9,
    sub: false,
    icon: 'q-lifestyle',
    complete: (a) => has(a.lifestyle),
  },
  // Optional: an empty «Готово» is fine.
  { id: 'notes', kind: 'text', slot: 10, sub: false, icon: 'q-notes', complete: () => true },
];

const BY_ID = new Map(STEPS.map((step) => [step.id, step]));

export function stepDef(id: StepId): StepDef {
  const step = BY_ID.get(id);
  if (!step) throw new Error(`unknown step ${id}`);
  return step;
}

export const isShown = (step: StepDef, answers: Answers) => step.showIf?.(answers) ?? true;

/** The next shown step after `id`, or null after the last one. */
export function nextStepId(id: StepId, answers: Answers): StepId | null {
  const index = STEPS.findIndex((step) => step.id === id);
  for (let i = index + 1; i < STEPS.length; i += 1) {
    const step = STEPS[i];
    if (step && isShown(step, answers)) return step.id;
  }
  return null;
}

/** The first step that is shown but not complete (a resumed draft continues there). */
export function firstIncompleteStep(answers: Answers): StepId | null {
  for (const step of STEPS) {
    if (isShown(step, answers) && !step.complete(answers)) return step.id;
  }
  return null;
}

/** Number shown to people: «Вопрос 3 из 11» (the slot, 1-based). */
export const questionNumber = (id: StepId) => stepDef(id).slot + 1;
