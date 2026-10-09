import { describe, expect, it } from 'vitest';
import {
  recommendedWeightRangeKg,
  targetWeightBoundsKg,
  targetWeightStartKg,
  WEIGHT_RULES,
} from './weight';

describe('recommendedWeightRangeKg', () => {
  it('adults 18–64: BMI 18.5–24.9, rounded inwards', () => {
    // 1.65 m: 18.5 × 2.7225 = 50.37 → 51; 24.9 × 2.7225 = 67.79 → 67.
    expect(recommendedWeightRangeKg(165, 30)).toEqual({ minKg: 51, maxKg: 67 });
    // 1.80 m: 59.94 → 60; 80.68 → 80.
    expect(recommendedWeightRangeKg(180, 18)).toEqual({ minKg: 60, maxKg: 80 });
  });

  it('65+: the older-adult band', () => {
    // 1.70 m: 23 × 2.89 = 66.47 → 67; 29.9 × 2.89 = 86.41 → 86.
    expect(recommendedWeightRangeKg(170, 65)).toEqual({ minKg: 67, maxKg: 86 });
    expect(recommendedWeightRangeKg(170, 64.9)).toEqual({ minKg: 54, maxKg: 71 });
  });

  it('minors: no range', () => {
    expect(recommendedWeightRangeKg(160, 17.9)).toBeNull();
    expect(recommendedWeightRangeKg(120, 7)).toBeNull();
  });

  it('every bound stays inside its BMI band', () => {
    for (let height = 140; height <= 210; height += 1) {
      const range = recommendedWeightRangeKg(height, 40);
      if (!range) throw new Error('expected a range');
      const h2 = (height / 100) ** 2;
      expect(range.minKg / h2).toBeGreaterThanOrEqual(WEIGHT_RULES.adultBmi.min);
      expect(range.maxKg / h2).toBeLessThanOrEqual(WEIGHT_RULES.adultBmi.max);
      expect(range.minKg).toBeLessThan(range.maxKg);
    }
  });
});

describe('targetWeightBoundsKg', () => {
  const adult = { heightCm: 165, ageYears: 30 };

  it('lose: below the current weight, never below BMI 18.5', () => {
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 70 })).toEqual({
      minKg: 51,
      maxKg: 69,
    });
  });

  it('lose: a weight with one decimal is rounded to the kilogram first', () => {
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 70.4 })?.maxKg).toBe(69);
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 70.6 })?.maxKg).toBe(70);
  });

  it('lose: no valid target within a kilogram of BMI 18.5', () => {
    // 1.65 m: floor 51 kg; current 51.4 → max 50 < 51.
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 51.4 })).toBeNull();
    // Exactly one kilogram of room left.
    expect(targetWeightBoundsKg({ ...adult, goal: 'lose', currentKg: 52 })).toEqual({
      minKg: 51,
      maxKg: 51,
    });
  });

  it('gain: above the current weight, at most +15 %', () => {
    expect(
      targetWeightBoundsKg({ goal: 'gain', currentKg: 60, heightCm: 175, ageYears: 25 }),
    ).toEqual({ minKg: 61, maxKg: 69 });
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
