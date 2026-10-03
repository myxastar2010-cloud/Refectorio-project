import { describe, expect, it } from 'vitest';
import { makeQuestionnaire as q } from '../testing';
import { evaluateGuardrails } from './index';

describe('guardrails: age', () => {
  it('refuses infants under 1 year', () => {
    const d = evaluateGuardrails(q({ ageYears: 0.5, heightCm: 68, weightKg: 7.5 }));
    expect(d.status).toBe('refused');
    expect(d.reasons).toEqual(['AGE_UNDER_1']);
    expect(d.referToDoctor).toEqual(['pediatrician']);
    expect(d.allowedGoals).toEqual([]);
    expect(d.individualEnergy).toBe(false);
  });

  it('asks for an adult when a child 1–13 fills the form alone', () => {
    const d = evaluateGuardrails(q({ ageYears: 10, heightCm: 140, weightKg: 32, mode: 'self' }));
    expect(d.status).toBe('requiresAdult');
    expect(d.reasons).toContain('CHILD_NEEDS_ADULT');
    expect(d.allowedGoals).toEqual(['maintain', 'habits']);
    expect(d.energyDeficitAllowed).toBe(false);
    expect(d.energySurplusAllowed).toBe(false);
  });

  it('limits children 1–13 in family mode to maintain/habits without energy goals', () => {
    const d = evaluateGuardrails(
      q({ ageYears: 10, heightCm: 140, weightKg: 32, mode: 'family', goal: 'lose' }),
    );
    expect(d.status).toBe('limited');
    expect(d.reasons).toEqual(['CHILD_FAMILY_MODE']);
    expect(d.allowedGoals).toEqual(['maintain', 'habits']);
    expect(d.individualEnergy).toBe(true);
  });

  it('gives no individual energy to toddlers 1–2 and refers to a paediatrician', () => {
    const d = evaluateGuardrails(q({ ageYears: 2, heightCm: 86, weightKg: 12, mode: 'family' }));
    expect(d.reasons).toEqual(['CHILD_FAMILY_MODE', 'TODDLER_NO_INDIVIDUAL_ENERGY']);
    expect(d.individualEnergy).toBe(false);
    expect(d.referToDoctor).toContain('pediatrician');
  });

  it('limits teenagers 14–17: no deficit or surplus, guest mode only, no diets', () => {
    const d = evaluateGuardrails(q({ ageYears: 14, heightCm: 165, weightKg: 55, goal: 'lose' }));
    expect(d.status).toBe('limited');
    expect(d.reasons).toEqual(['TEEN_NO_ENERGY_GOALS']);
    expect(d.guestOnly).toBe(true);
    expect(d.allowedGoals).toEqual(['maintain', 'habits']);
    expect(d.forbiddenRegimes).toEqual(['intermittentFasting', 'keto', 'vlcd']);
  });

  it('treats 18.0 as an adult', () => {
    const d = evaluateGuardrails(q({ ageYears: 18 }));
    expect(d.status).toBe('allowed');
    expect(d.reasons).toEqual([]);
    expect(d.allowedGoals).toEqual(['maintain', 'lose', 'gain', 'habits']);
    expect(d.guestOnly).toBe(false);
  });
});

describe('guardrails: pregnancy and lactation', () => {
  it('pregnancy: limited, no weight loss, no surplus beyond the norms, no diets, refer', () => {
    const d = evaluateGuardrails(q({ pregnancy: 'trimester2', goal: 'lose' }));
    expect(d.status).toBe('limited');
    expect(d.reasons).toEqual(['PREGNANCY']);
    expect(d.allowedGoals).toEqual(['maintain', 'gain', 'habits']);
    expect(d.energyDeficitAllowed).toBe(false);
    expect(d.energySurplusAllowed).toBe(false);
    expect(d.referToDoctor).toEqual(['obstetrician']);
  });

  it('lactation: limited to maintain/habits', () => {
    const d = evaluateGuardrails(q({ lactation: 'months0to6' }));
    expect(d.reasons).toEqual(['LACTATION']);
    expect(d.allowedGoals).toEqual(['maintain', 'habits']);
  });

  it('a pregnant teenager gets both sets of restrictions', () => {
    const d = evaluateGuardrails(q({ ageYears: 16, pregnancy: 'trimester1' }));
    expect(d.reasons).toEqual(['TEEN_NO_ENERGY_GOALS', 'PREGNANCY']);
    expect(d.allowedGoals).toEqual(['maintain', 'habits']);
    expect(d.guestOnly).toBe(true);
  });
});

describe('guardrails: health', () => {
  it.each([
    ['diabetesInsulin', 'DIABETES_INSULIN', 'endocrinologist'],
    ['kidneyDisease', 'KIDNEY_DISEASE', 'nephrologist'],
    ['pku', 'PKU', 'geneticist'],
  ] as const)('%s → refused', (flag, reason, specialist) => {
    const d = evaluateGuardrails(q({ health: [flag] }));
    expect(d.status).toBe('refused');
    expect(d.reasons).toEqual([reason]);
    expect(d.referToDoctor).toEqual([specialist]);
    expect(d.allowedGoals).toEqual([]);
    expect(d.individualEnergy).toBe(false);
  });

  it('type 2 diabetes without insulin → limited, no energy goals, no fasting', () => {
    const d = evaluateGuardrails(q({ health: ['diabetesType2'] }));
    expect(d.status).toBe('limited');
    expect(d.allowedGoals).toEqual(['maintain', 'habits']);
    expect(d.forbiddenRegimes).toContain('intermittentFasting');
  });

  it('warfarin keeps vitamin K stable, MAO inhibitors exclude high-tyramine dishes', () => {
    const d = evaluateGuardrails(q({ health: ['warfarin', 'maoi'], goal: 'lose' }));
    expect(d.status).toBe('limited');
    expect(d.dishRules).toEqual(['stableVitaminK', 'excludeHighTyramine']);
    expect(d.allowedGoals).toContain('lose');
    expect(d.energyDeficitAllowed).toBe(true);
  });

  it('eating-disorder history and a positive screen de-emphasise numbers and remove energy goals', () => {
    const history = evaluateGuardrails(q({ health: ['eatingDisorderHistory'] }));
    expect(history.reasons).toEqual(['ED_HISTORY']);
    expect(history.deemphasizeNumbers).toBe(true);
    expect(history.allowedGoals).toEqual(['maintain', 'habits']);
    expect(history.referToDoctor).toEqual(['mentalHealth']);

    const screen = evaluateGuardrails(q({ edScreenPositive: true }));
    expect(screen.status).toBe('limited');
    expect(screen.reasons).toEqual(['ED_SCREEN_POSITIVE']);
  });

  it('merges: strictest status wins, referrals and restrictions accumulate', () => {
    const d = evaluateGuardrails(
      q({ health: ['warfarin', 'kidneyDisease'], edScreenPositive: true }),
    );
    expect(d.status).toBe('refused');
    expect(d.referToDoctor).toEqual(['nephrologist', 'gp', 'mentalHealth']);
    expect(d.deemphasizeNumbers).toBe(true);
  });
});

describe('guardrails: body', () => {
  it('adult with BMI < 18.5 cannot choose weight loss', () => {
    // 45 kg / 1.65² = 16.5
    const d = evaluateGuardrails(q({ weightKg: 45, goal: 'lose' }));
    expect(d.status).toBe('requiresDoctor');
    expect(d.reasons).toEqual(['BMI_UNDERWEIGHT']);
    expect(d.allowedGoals).toEqual(['maintain', 'gain', 'habits']);
    expect(d.energyDeficitAllowed).toBe(false);
  });

  it('older adults: caution for low or high BMI and for weight loss', () => {
    expect(evaluateGuardrails(q({ ageYears: 70, weightKg: 45 })).reasons).toEqual([
      'BMI_UNDERWEIGHT',
      'OLDER_ADULT_CAUTION',
    ]);
    // 85 kg / 1.65² = 31.2
    expect(evaluateGuardrails(q({ ageYears: 70, weightKg: 85 })).reasons).toEqual([
      'OLDER_ADULT_CAUTION',
    ]);
    const losing = evaluateGuardrails(q({ ageYears: 70, goal: 'lose' }));
    expect(losing.status).toBe('requiresDoctor');
    expect(losing.allowedGoals).toContain('lose');
    expect(evaluateGuardrails(q({ ageYears: 70 })).status).toBe('allowed');
  });

  it('does not apply adult BMI rules to minors', () => {
    const d = evaluateGuardrails(q({ ageYears: 15, weightKg: 40 }));
    expect(d.reasons).toEqual(['TEEN_NO_ENERGY_GOALS']);
  });
});
