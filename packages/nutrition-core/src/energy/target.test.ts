import { describe, expect, it } from 'vitest';
import { evaluateGuardrails } from '../guardrails';
import { makeQuestionnaire } from '../testing';
import type { Questionnaire } from '../types';
import { mifflinStJeorKcal } from './bmr';
import { ENERGY_PER_KG_KCAL, energyTarget, type AdultEnergy } from './target';

const run = (overrides: Partial<Questionnaire>) => {
  const questionnaire = makeQuestionnaire(overrides);
  return energyTarget(questionnaire, evaluateGuardrails(questionnaire));
};

const adult = (overrides: Partial<Questionnaire>): AdultEnergy => {
  const result = run(overrides);
  if (result.kind !== 'adult') throw new Error(`expected adult energy, got ${result.kind}`);
  return result;
};

describe('energy target: adults', () => {
  it('maintenance = Mifflin × PAL of the МР activity group', () => {
    const e = adult({});
    const bmr = mifflinStJeorKcal({ weightKg: 60, heightCm: 165, ageYears: 30, sex: 'female' });
    expect(e.method).toBe('mifflinStJeor');
    expect(e.pal).toBe(1.6);
    expect(e.tdeeKcal).toBeCloseTo(bmr * 1.6, 9);
    expect(e.targetKcal).toBe(e.tdeeKcal);
    expect(e.ratePctPerWeek).toBe(0);
  });

  it('uses Katch–McArdle when body fat is known', () => {
    const e = adult({ bodyFatPct: 25 });
    expect(e.method).toBe('katchMcArdle');
    expect(e.bmrKcal).toBeCloseTo(370 + 21.6 * 45, 9);
  });

  it('older adults use МР PAL 1.7, but never less than their activity group (D-016)', () => {
    expect(adult({ ageYears: 70, activity: 'kfa1' }).pal).toBe(1.7);
    expect(adult({ ageYears: 70, activity: 'kfa4' }).pal).toBe(2.2);
  });

  it('weight loss: default 0.5 %/week via 7700 kcal/kg', () => {
    const e = adult({ sex: 'male', weightKg: 90, heightCm: 180, goal: 'lose', activity: 'kfa3' });
    const deficit = (0.005 * 90 * ENERGY_PER_KG_KCAL) / 7;
    expect(e.targetKcal).toBeCloseTo(e.tdeeKcal - deficit, 6);
    expect(e.ratePctPerWeek).toBeCloseTo(0.5, 9);
    expect(e.floorApplied).toBe(false);
  });

  it('caps the requested rate at 1 %/week', () => {
    const e = adult({
      sex: 'male',
      weightKg: 100,
      heightCm: 185,
      goal: 'lose',
      ratePctPerWeek: 1,
      activity: 'kfa4',
    });
    expect(e.rateCapped).toBe(false);
    const capped = adult({
      sex: 'male',
      weightKg: 100,
      heightCm: 185,
      goal: 'gain',
      ratePctPerWeek: 0.9,
    });
    expect(capped.rateCapped).toBe(true);
    expect(capped.ratePctPerWeek).toBe(0.5);
  });

  it('never goes below the 1200/1500 kcal floor and reduces the rate instead', () => {
    const e = adult({
      weightKg: 70,
      heightCm: 160,
      ageYears: 50,
      activity: 'kfa1',
      goal: 'lose',
      ratePctPerWeek: 1,
    });
    expect(e.floorApplied).toBe(true);
    expect(e.targetKcal).toBe(1200);
    expect(e.ratePctPerWeek).toBeLessThan(1);
    expect(e.ratePctPerWeek).toBeCloseTo(
      ((e.tdeeKcal - 1200) * 7 * 100) / (ENERGY_PER_KG_KCAL * 70),
      9,
    );
  });

  it('keeps maintenance when maintenance itself is below the floor (no surplus by accident)', () => {
    // Mifflin: 379.6 + 875 − 295.2 − 161 ≈ 798 kcal × 1.4 ≈ 1118 kcal < 1200; BMI 19.4 allows "lose".
    const e = adult({ weightKg: 38, heightCm: 140, ageYears: 60, activity: 'kfa1', goal: 'lose' });
    expect(e.tdeeKcal).toBeLessThan(1200);
    expect(e.targetKcal).toBe(e.tdeeKcal);
    expect(e.ratePctPerWeek).toBe(0);
  });

  it('weight gain: default 0.25 %/week', () => {
    const e = adult({ sex: 'male', weightKg: 60, heightCm: 180, goal: 'gain' });
    expect(e.targetKcal).toBeCloseTo(e.tdeeKcal + (0.0025 * 60 * ENERGY_PER_KG_KCAL) / 7, 6);
  });

  it('falls back to maintenance when guardrails do not allow the goal', () => {
    const e = adult({ weightKg: 45, goal: 'lose' });
    expect(e.goal).toBe('maintain');
    expect(e.goalAdjusted).toBe(true);
    expect(e.targetKcal).toBe(e.tdeeKcal);
  });

  it('adds the МР pregnancy and lactation allowances (the larger one if both)', () => {
    expect(adult({ pregnancy: 'trimester2' }).extraKcal).toBe(250);
    expect(adult({ pregnancy: 'trimester3' }).extraKcal).toBe(350);
    expect(adult({ lactation: 'months0to6' }).extraKcal).toBe(500);
    expect(adult({ pregnancy: 'trimester3', lactation: 'months7to12' }).extraKcal).toBe(450);
  });

  it('pregnancy "gain" follows the norms only (no extra surplus)', () => {
    const e = adult({ pregnancy: 'trimester2', goal: 'gain' });
    expect(e.goal).toBe('gain');
    expect(e.targetKcal).toBe(e.tdeeKcal);
  });
});

describe('energy target: minors and refusals', () => {
  it('children 3–17 get the EER without deficit', () => {
    const result = run({ ageYears: 12, heightCm: 150, weightKg: 40, mode: 'family', goal: 'lose' });
    expect(result.kind).toBe('child');
    if (result.kind === 'child') expect(result.targetKcal).toBe(result.eerKcal);
  });

  it('a pregnant teenager gets the pregnancy allowance on top of the EER', () => {
    const result = run({ ageYears: 17, heightCm: 165, weightKg: 58, pregnancy: 'trimester3' });
    expect(result.kind === 'child' && result.targetKcal - result.eerKcal).toBe(350);
  });

  it('no individual energy for toddlers and refused cases', () => {
    expect(run({ ageYears: 2, heightCm: 86, weightKg: 12, mode: 'family' })).toEqual({
      kind: 'none',
      reason: 'noIndividualEnergy',
    });
    expect(run({ health: ['kidneyDisease'] })).toEqual({ kind: 'none', reason: 'refused' });
  });

  it('implausible body data give no number instead of a negative one (code review, stage 0)', () => {
    // Every field is in range on its own, but BMR would be −440 kcal.
    expect(run({ ageYears: 120, heightCm: 45, weightKg: 3 })).toEqual({
      kind: 'none',
      reason: 'implausibleBody',
    });
    expect(run({ ageYears: 10, heightCm: 45, weightKg: 3, mode: 'family' })).toEqual({
      kind: 'none',
      reason: 'implausibleBody',
    });
  });

  it('never returns a target below 800 kcal (VLCD): such cases go to a doctor', () => {
    // BMR ≈ 383 kcal would pass the plausibility check only with a lower limit; maintenance ≈ 650 < 800.
    const tiny = run({ ageYears: 80, heightCm: 110, weightKg: 25, activity: 'kfa1', goal: 'lose' });
    expect(tiny.kind).toBe('none');
    // A sweep over small bodies: every number that is produced respects the limit.
    for (let weightKg = 20; weightKg <= 60; weightKg += 5) {
      for (const heightCm of [100, 120, 140, 160]) {
        for (const ageYears of [18, 50, 90]) {
          const e = run({
            weightKg,
            heightCm,
            ageYears,
            activity: 'kfa1',
            goal: 'lose',
            ratePctPerWeek: 1,
          });
          if (e.kind === 'adult') expect(e.targetKcal).toBeGreaterThanOrEqual(800);
        }
      }
    }
  });

  it('target energy is never negative and grows with weight (property)', () => {
    let previous = 0;
    for (let weightKg = 40; weightKg <= 150; weightKg += 10) {
      const e = adult({ weightKg, heightCm: 175, sex: 'male' });
      expect(e.targetKcal).toBeGreaterThan(previous);
      previous = e.targetKcal;
    }
  });
});
