import { describe, expect, it } from 'vitest';
import { evaluateGuardrails } from './guardrails';
import { energyTarget } from './energy/target';
import personas from './fixtures/test-personas.json';
import { validateQuestionnaire, type InputErrorCode, type QuestionnaireInput } from './input';
import type { Questionnaire } from './types';

/**
 * Reference personas (research/test-personas.json, phase 0.4) — every persona whose expectation concerns
 * input validation, guardrails or energy is replayed through the real code.
 */

type Persona = {
  id: string;
  title: string;
  input: Record<string, unknown>;
  expected: {
    inputError?: string;
    guardrail?: {
      status?: string;
      reasonsInclude?: string[];
      allowedGoals?: string[];
      energyDeficitAllowed?: boolean;
      energySurplusAllowed?: boolean;
      deemphasizeNumbers?: boolean;
      guestOnly?: boolean;
      forbiddenRegimesInclude?: string[];
      dishRulesInclude?: string[];
      referToDoctorInclude?: string[];
    };
    energy?: {
      method?: string;
      bmrKcal?: number;
      tdeeKcal?: number;
      targetKcal?: number;
      floorApplied?: boolean;
    };
  };
};

/** Persona error codes → field + code of `validateQuestionnaire`. */
const INPUT_ERRORS: Record<string, [keyof Questionnaire, InputErrorCode]> = {
  PREGNANCY_REQUIRES_FEMALE_OR_UNSPECIFIED: [
    'pregnancy',
    'PREGNANCY_REQUIRES_FEMALE_OR_UNSPECIFIED',
  ],
  LACTATION_REQUIRES_FEMALE_OR_UNSPECIFIED: [
    'lactation',
    'LACTATION_REQUIRES_FEMALE_OR_UNSPECIFIED',
  ],
  HEIGHT_OUT_OF_RANGE: ['heightCm', 'OUT_OF_RANGE'],
  WEIGHT_OUT_OF_RANGE: ['weightKg', 'OUT_OF_RANGE'],
  BMI_IMPLAUSIBLE: ['weightKg', 'IMPLAUSIBLE_BMI'],
  RATE_OUT_OF_RANGE: ['ratePctPerWeek', 'OUT_OF_RANGE'],
  DISLIKES_OTHER_TOO_LONG: ['dislikesOther', 'TOO_LONG'],
  DISLIKES_TOO_MANY: ['dislikes', 'TOO_MANY_ITEMS'],
  MEALS_PER_DAY_OUT_OF_RANGE: ['mealsPerDay', 'OUT_OF_RANGE'],
  COOK_TIME_OUT_OF_RANGE: ['cookTimeMaxMin', 'OUT_OF_RANGE'],
};

/** Energy-related reasons are flags of the energy result, not guardrail reasons. */
const ENERGY_REASONS = new Set(['RATE_CAPPED', 'CALORIE_FLOOR_APPLIED']);

const METHODS: Record<string, string> = {
  mifflin: 'mifflinStJeor',
  katchMcArdle: 'katchMcArdle',
  eerNasem2023: 'eerNasem2023',
};

const all = personas as Persona[];

describe('reference personas', () => {
  it('there are at least 60 of them, with unique ids', () => {
    expect(all.length).toBeGreaterThanOrEqual(60);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it.each(all.map((p) => [`${p.id} ${p.title}`, p] as const))('%s', (_name, persona) => {
    const validated = validateQuestionnaire(persona.input as QuestionnaireInput);
    const { expected } = persona;

    if (expected.inputError) {
      const mapping = INPUT_ERRORS[expected.inputError];
      expect(mapping, `unknown persona error code ${expected.inputError}`).toBeDefined();
      expect(validated.ok).toBe(false);
      if (!validated.ok && mapping) {
        expect(validated.error).toContainEqual({ field: mapping[0], code: mapping[1] });
      }
      return;
    }

    expect(validated.ok, JSON.stringify(validated.ok ? null : validated.error)).toBe(true);
    if (!validated.ok) return;
    const q = validated.value;
    const decision = evaluateGuardrails(q);
    const energy = energyTarget(q, decision);
    const g = expected.guardrail;

    if (g) {
      if (g.status) expect(decision.status).toBe(g.status);
      for (const reason of g.reasonsInclude ?? []) {
        if (reason === 'RATE_CAPPED')
          expect(energy.kind === 'adult' && energy.rateCapped).toBe(true);
        else if (reason === 'CALORIE_FLOOR_APPLIED')
          expect(energy.kind === 'adult' && energy.floorApplied).toBe(true);
        else if (!ENERGY_REASONS.has(reason)) expect(decision.reasons).toContain(reason);
      }
      if (g.allowedGoals)
        expect([...decision.allowedGoals].sort()).toEqual([...g.allowedGoals].sort());
      if (g.energyDeficitAllowed !== undefined)
        expect(decision.energyDeficitAllowed).toBe(g.energyDeficitAllowed);
      if (g.energySurplusAllowed !== undefined)
        expect(decision.energySurplusAllowed).toBe(g.energySurplusAllowed);
      if (g.deemphasizeNumbers !== undefined)
        expect(decision.deemphasizeNumbers).toBe(g.deemphasizeNumbers);
      if (g.guestOnly !== undefined) expect(decision.guestOnly).toBe(g.guestOnly);
      for (const regime of g.forbiddenRegimesInclude ?? [])
        expect(decision.forbiddenRegimes).toContain(regime);
      for (const rule of g.dishRulesInclude ?? []) expect(decision.dishRules).toContain(rule);
      for (const specialist of g.referToDoctorInclude ?? [])
        expect(decision.referToDoctor).toContain(specialist);
    }

    const e = expected.energy;
    if (e?.method === 'none') {
      expect(energy.kind).toBe('none');
    } else if (e?.method) {
      expect(energy.kind === 'none' ? 'none' : energy.method).toBe(METHODS[e.method]);
    }
    if (e && energy.kind === 'adult') {
      // Personas store rounded kcal: ±1 kcal.
      if (e.bmrKcal !== undefined)
        expect(Math.abs(energy.bmrKcal - e.bmrKcal)).toBeLessThanOrEqual(1);
      if (e.tdeeKcal !== undefined)
        expect(Math.abs(energy.tdeeKcal - e.tdeeKcal)).toBeLessThanOrEqual(1);
      if (e.targetKcal !== undefined)
        expect(Math.abs(energy.targetKcal - e.targetKcal)).toBeLessThanOrEqual(1);
      if (e.floorApplied !== undefined) expect(energy.floorApplied).toBe(e.floorApplied);
    }
  });
});
