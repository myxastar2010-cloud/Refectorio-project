import { describe, expect, it } from 'vitest';
import {
  AMDR,
  energyShares,
  fiberTargetG,
  macroTargets,
  proteinGPerKg,
  waterTargetMl,
} from './macros';

const base = { sex: 'female', weightKg: 60, pregnancy: 'none', lactation: 'none' } as const;

describe('protein (g/kg)', () => {
  it('adult base 0.83, raised for 65+, gain and lose', () => {
    expect(proteinGPerKg(30, 'maintain')).toBe(0.83);
    expect(proteinGPerKg(70, 'maintain')).toBe(1);
    expect(proteinGPerKg(30, 'gain')).toBe(1.6);
    expect(proteinGPerKg(30, 'lose')).toBe(1.2);
    expect(proteinGPerKg(70, 'lose')).toBe(1.2);
  });

  it('children by age band', () => {
    expect(proteinGPerKg(2, 'maintain')).toBe(1.05);
    expect(proteinGPerKg(10, 'maintain')).toBe(0.95);
    expect(proteinGPerKg(16, 'maintain')).toBe(0.85);
    // Below the first band the first band applies (only for completeness: under-1 is refused by guardrails).
    expect(proteinGPerKg(0.5, 'maintain')).toBe(1.05);
  });
});

describe('fibre and water', () => {
  it('fibre: 14 g/1000 kcal for adults, never below 25 g; WHO bands for children', () => {
    expect(fiberTargetG(30, 2500)).toBeCloseTo(35, 9);
    expect(fiberTargetG(30, 1500)).toBe(25);
    expect(fiberTargetG(4, 1300)).toBe(15);
    expect(fiberTargetG(8, 1600)).toBe(21);
    expect(fiberTargetG(15, 2400)).toBe(25);
    expect(fiberTargetG(1.5, 1000)).toBeNull();
  });

  it('water: EFSA total water by sex and age, plus pregnancy/lactation', () => {
    expect(waterTargetMl({ ...base, ageYears: 30 })).toBe(2000);
    expect(waterTargetMl({ ...base, ageYears: 30, sex: 'male' })).toBe(2500);
    expect(waterTargetMl({ ...base, ageYears: 30, pregnancy: 'trimester2' })).toBe(2300);
    expect(waterTargetMl({ ...base, ageYears: 30, lactation: 'months0to6' })).toBe(2700);
    expect(waterTargetMl({ ...base, ageYears: 10, sex: 'male' })).toBe(2100);
    expect(waterTargetMl({ ...base, ageYears: 10 })).toBe(1900);
    expect(waterTargetMl({ ...base, ageYears: 3, sex: 'unspecified' })).toBe(1300);
  });
});

describe('macro targets', () => {
  it('protein from g/kg, fat 30 %, carbs the rest; sugar and saturated-fat ceilings', () => {
    const m = macroTargets({ ...base, ageYears: 30 }, 2000, 'maintain');
    expect(m.proteinG).toBeCloseTo(49.8, 9);
    expect(m.fatG).toBeCloseTo(600 / 9, 9);
    expect(m.carbG).toBeCloseTo((2000 - 49.8 * 4 - 600) / 4, 9);
    expect(m.freeSugarsMaxG).toBeCloseTo(50, 9);
    expect(m.saturatedFatMaxG).toBeCloseTo(200 / 9, 9);
    const shares = energyShares(m.proteinG, m.fatG, m.carbG);
    expect(shares.fat).toBeCloseTo(0.3, 9);
    expect(shares.carb).toBeGreaterThanOrEqual(AMDR.carb[0]);
    expect(shares.carb).toBeLessThanOrEqual(AMDR.carb[1]);
  });

  it('no added sugar under 2 years, carbs never negative', () => {
    expect(
      macroTargets({ ...base, ageYears: 1.5, weightKg: 11 }, 900, 'maintain').freeSugarsMaxG,
    ).toBe(0);
    expect(macroTargets({ ...base, ageYears: 30, weightKg: 200 }, 500, 'gain').carbG).toBe(0);
  });

  it('energy shares of zero intake are zero', () => {
    expect(energyShares(0, 0, 0)).toEqual({ protein: 0, fat: 0, carb: 0 });
  });
});
