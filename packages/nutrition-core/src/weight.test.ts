import { describe, expect, it } from 'vitest';
import { adultBmiCategory, bmiKgM2 } from './status';
import { recommendedWeightRangeKg, targetWeightBoundsKg, targetWeightStartKg } from './weight';

describe('recommendedWeightRangeKg', () => {
  it('adults 18–64: BMI [18.5; 25), rounded inwards', () => {
    // 1.65 m: 18.5 × 2.7225 = 50.37 → 51; 25 × 2.7225 = 68.06 → the largest weight below is 68.
    expect(recommendedWeightRangeKg(165, 30)).toEqual({ minKg: 51, maxKg: 68 });
    // 1.80 m: 59.94 → 60; 81.0 → 80 (exactly BMI 25 is not «normal»).
    expect(recommendedWeightRangeKg(180, 18)).toEqual({ minKg: 60, maxKg: 80 });
  });

  it('65+: BMI [23; 30)', () => {
    // 1.70 m: 23 × 2.89 = 66.47 → 67; 30 × 2.89 = 86.7 → 86.
    expect(recommendedWeightRangeKg(170, 65)).toEqual({ minKg: 67, maxKg: 86 });
    expect(recommendedWeightRangeKg(170, 64.9)).toEqual({ minKg: 54, maxKg: 72 });
  });

  it('minors: no range', () => {
    expect(recommendedWeightRangeKg(160, 17.9)).toBeNull();
    expect(recommendedWeightRangeKg(120, 7)).toBeNull();
  });

  it('every bound is «normal» by the WHO categories (agrees with adultBmiCategory)', () => {
    for (let height = 140; height <= 210; height += 1) {
      const range = recommendedWeightRangeKg(height, 40);
      if (!range) throw new Error('expected a range');
      expect(adultBmiCategory(bmiKgM2(range.minKg, height))).toBe('normal');
      expect(adultBmiCategory(bmiKgM2(range.maxKg, height))).toBe('normal');
      expect(adultBmiCategory(bmiKgM2(range.minKg - 1, height))).toBe('underweight');
      // One kilogram more reaches BMI 25 (exactly 25.0 at 1.80 m: 81 / 3.24, a float error away from «normal»).
      expect(bmiKgM2(range.maxKg + 1, height)).toBeGreaterThan(25 - 1e-9);
    }
  });
});

describe('targetWeightBoundsKg', () => {
  const adult = { heightCm: 165, ageYears: 30 };

  it('lose: at least a kilogram below the current weight, never below BMI 18.5', () => {
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 70 })).toEqual({
      minKg: 51,
      maxKg: 69,
    });
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 70.4 })?.maxKg).toBe(69);
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 70.9 })?.maxKg).toBe(69);
  });

  it('lose at 65+: never below BMI 23', () => {
    // 1.70 m: 23 × 2.89 = 66.47 → 67.
    expect(
      targetWeightBoundsKg({ goal: 'lose', currentKg: 80, heightCm: 170, ageYears: 70 }),
    ).toEqual({ minKg: 67, maxKg: 79 });
  });

  it('lose: no valid target within a kilogram of the floor', () => {
    // 1.65 m: floor 51 kg; current 51.4 → max 50 < 51.
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 51.4 })).toBeNull();
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 52 })).toEqual({
      minKg: 51,
      maxKg: 51,
    });
  });

  it('gain below BMI 25: up to +15 % or BMI 25, whichever is lower', () => {
    // 1.80 m, 60 kg (BMI 18.5): +15 % = 69, BMI 25 → 80: 69 (stage-2-mappings §6.4).
    expect(
      targetWeightBoundsKg({ goal: 'gain', currentKg: 60, heightCm: 180, ageYears: 20 }),
    ).toEqual({ minKg: 61, maxKg: 69 });
    // 1.65 m, 64 kg: +15 % = 73.6, BMI 25 → 68: 68.
    expect(targetWeightBoundsKg({ ...adult, goal: 'gain', currentKg: 64 })).toEqual({
      minKg: 65,
      maxKg: 68,
    });
  });

  it('gain at BMI 25 and above: a modest +5 %', () => {
    // 1.65 m, 80 kg (BMI 29.4): +5 % = 84.
    expect(targetWeightBoundsKg({ ...adult, goal: 'gain', currentKg: 80 })).toEqual({
      minKg: 81,
      maxKg: 84,
    });
    // BMI 34: still +5 %.
    expect(targetWeightBoundsKg({ ...adult, goal: 'gain', currentKg: 92.5 })).toEqual({
      minKg: 94,
      maxKg: 97,
    });
  });

  it('gain: a very light person still gets one step', () => {
    expect(
      targetWeightBoundsKg({ goal: 'gain', currentKg: 5, heightCm: 60, ageYears: 18 }),
    ).toEqual({ minKg: 6, maxKg: 6 });
  });

  it('maintain, habits and minors: no target', () => {
    expect(targetWeightBoundsKg({ ...adult, goal: 'maintain', currentKg: 60 })).toBeNull();
    expect(targetWeightBoundsKg({ ...adult, goal: 'habits', currentKg: 60 })).toBeNull();
    expect(
      targetWeightBoundsKg({ goal: 'lose', currentKg: 60, heightCm: 165, ageYears: 16 }),
    ).toBeNull();
  });
});

describe('targetWeightStartKg', () => {
  const adult = { currentKg: 70, heightCm: 165, ageYears: 30 };

  it('starts one kilogram in the goal direction', () => {
    expect(targetWeightStartKg({ ...adult, goal: 'lose' })).toBe(69);
    expect(targetWeightStartKg({ ...adult, goal: 'gain' })).toBe(71);
    expect(targetWeightStartKg({ ...adult, goal: 'maintain' })).toBeNull();
  });
});
