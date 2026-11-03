import { describe, expect, it } from 'vitest';
import { KCAL_PER_G } from './macros';
import { effectiveMacroProfile, profileMacros } from './profiles';
import { MACRO_PROFILES } from './types';

const man = { ageYears: 30, weightKg: 80, strengthTraining: false } as const;
const KCAL = 2851;

const shares = (m: ReturnType<typeof profileMacros>) => ({
  protein: (m.proteinG.target * KCAL_PER_G.protein) / KCAL,
  fat: (m.fatG.target * KCAL_PER_G.fat) / KCAL,
  carb: (m.carbsG.target * KCAL_PER_G.carb) / KCAL,
});

describe('profileMacros (stage-2-mappings §2.1, R17 §8)', () => {
  it('recommended: protein g/kg inside AMDR, fat 30 %, carbohydrates the rest up to 60 %', () => {
    const m = profileMacros(man, KCAL, 'maintain', 'recommended');
    const s = shares(m);
    // 0.83 g/kg × 80 kg is 9.3 % of 2851 kcal → the AMDR floor of 10 %.
    expect(s.protein).toBeCloseTo(0.1, 6);
    expect(s.fat).toBeCloseTo(0.3, 6);
    expect(s.carb).toBeCloseTo(0.6, 6);
    expect(m.fatG.min).toBeCloseTo((0.2 * KCAL) / 9, 6);
    expect(m.fatG.max).toBeCloseTo((0.35 * KCAL) / 9, 6);
    expect(m.carbsG.max).toBeCloseTo((0.6 * KCAL) / 4, 6);
    expect(m.proteinG.max).toBeCloseTo((0.35 * KCAL) / 4, 6);
  });

  it('strength training raises protein to 1.4 g/kg (ISSN)', () => {
    const m = profileMacros({ ...man, strengthTraining: true }, KCAL, 'maintain', 'recommended');
    expect(m.proteinG.target).toBeCloseTo(1.4 * 80, 6);
  });

  it('highProtein: 1.6 g/kg, fat 25 %', () => {
    const s = shares(profileMacros(man, KCAL, 'maintain', 'highProtein'));
    expect(s.protein).toBeCloseTo((1.6 * 80 * 4) / KCAL, 6);
    expect(s.fat).toBeCloseTo(0.25, 6);
    expect(s.carb).toBeGreaterThanOrEqual(0.45);
  });

  it('highProtein never goes over 35 % of energy', () => {
    const m = profileMacros({ ...man, weightKg: 140 }, 1500, 'lose', 'highProtein');
    expect((m.proteinG.target * 4) / 1500).toBeCloseTo(0.35, 6);
    expect(m.carbsG.target).toBeGreaterThan(0);
  });

  it('lowCarb: carbohydrates 40–45 %, protein at least 22 %', () => {
    const m = profileMacros(man, KCAL, 'maintain', 'lowCarb');
    const s = shares(m);
    expect(s.carb).toBeCloseTo(0.45, 6);
    expect(s.protein).toBeCloseTo(0.22, 6);
    expect(s.fat).toBeCloseTo(0.33, 6);
    expect((m.carbsG.min * 4) / KCAL).toBeCloseTo(0.4, 6);
    expect((m.carbsG.max * 4) / KCAL).toBeCloseTo(0.45, 6);
  });

  it('keto: carbohydrates under 10 %, protein 20 %, fat the rest', () => {
    const m = profileMacros(man, 2000, 'maintain', 'keto');
    expect((m.carbsG.max * 4) / 2000).toBeCloseTo(0.1, 6);
    expect(m.carbsG.min).toBe(0);
    expect((m.proteinG.target * 4) / 2000).toBeCloseTo(0.2, 6);
    expect((m.fatG.target * 9) / 2000).toBeCloseTo(0.73, 6);
  });

  it('lowFat: fat at 20 %, carbohydrates capped at 60 % by more protein', () => {
    const s = shares(profileMacros(man, KCAL, 'maintain', 'lowFat'));
    expect(s.fat).toBeCloseTo(0.2, 6);
    expect(s.protein).toBeCloseTo(0.2, 6);
    expect(s.carb).toBeCloseTo(0.6, 6);
  });

  it('target shares always add up to 100 %', () => {
    for (const profile of MACRO_PROFILES) {
      for (const kcal of [1200, 2000, 3500]) {
        const m = profileMacros(man, kcal, 'maintain', profile);
        const total = m.proteinG.target * 4 + m.fatG.target * 9 + m.carbsG.target * 4;
        expect(total).toBeCloseTo(kcal, 6);
        expect(m.fatG.min).toBeLessThanOrEqual(m.fatG.target + 1e-9);
        expect(m.carbsG.target).toBeLessThanOrEqual(m.carbsG.max + 1e-9);
      }
    }
  });
});

describe('effectiveMacroProfile (stage-2-mappings §2.4)', () => {
  const adult = {
    ageYears: 35,
    heightCm: 170,
    weightKg: 70,
    pregnancy: 'none',
    lactation: 'none',
  } as const;
  const free = { deemphasizeNumbers: false, forbiddenRegimes: [] } as const;

  it('keeps the choice of an adult without restrictions', () => {
    for (const profile of MACRO_PROFILES) {
      expect(effectiveMacroProfile(profile, adult, free)).toEqual({ profile, adjusted: false });
    }
  });

  it('gives minors, pregnancy, lactation and eating disorders the recommended profile', () => {
    const cases = [
      [{ ...adult, ageYears: 16 }, free],
      [{ ...adult, pregnancy: 'trimester2' as const }, free],
      [{ ...adult, lactation: 'months0to6' as const }, free],
      [adult, { ...free, deemphasizeNumbers: true }],
    ] as const;
    for (const [q, decision] of cases) {
      expect(effectiveMacroProfile('lowCarb', q, decision)).toEqual({
        profile: 'recommended',
        adjusted: true,
      });
      expect(effectiveMacroProfile('recommended', q, decision).adjusted).toBe(false);
    }
  });

  it('allows only high-protein besides recommended at BMI < 18.5', () => {
    const thin = { ...adult, weightKg: 50 };
    expect(effectiveMacroProfile('highProtein', thin, free).profile).toBe('highProtein');
    expect(effectiveMacroProfile('lowFat', thin, free).profile).toBe('recommended');
  });

  it('never keeps keto where the guardrails forbid it or from 65 years', () => {
    expect(
      effectiveMacroProfile('keto', adult, { ...free, forbiddenRegimes: ['keto'] }).profile,
    ).toBe('recommended');
    expect(effectiveMacroProfile('keto', { ...adult, ageYears: 70 }, free).profile).toBe(
      'recommended',
    );
    expect(effectiveMacroProfile('lowCarb', { ...adult, ageYears: 70 }, free).profile).toBe(
      'lowCarb',
    );
  });
});
