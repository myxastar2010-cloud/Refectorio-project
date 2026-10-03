import { describe, expect, it } from 'vitest';
import { adultBmiCategory, bmiKgM2, childBmiCategory, lmsValueAtZ, lmsZScore } from './status';

describe('BMI', () => {
  it('is weight / height²', () => {
    expect(bmiKgM2(70, 175)).toBeCloseTo(22.857, 3);
  });

  it('uses the WHO adult cut-offs', () => {
    expect(adultBmiCategory(18.49)).toBe('underweight');
    expect(adultBmiCategory(18.5)).toBe('normal');
    expect(adultBmiCategory(24.99)).toBe('normal');
    expect(adultBmiCategory(25)).toBe('preobese');
    expect(adultBmiCategory(30)).toBe('obesityClass1');
    expect(adultBmiCategory(35)).toBe('obesityClass2');
    expect(adultBmiCategory(40)).toBe('obesityClass3');
  });
});

describe('BMI-for-age z-score (WHO 2007 restricted LMS)', () => {
  // Worked examples from the WHO 2007 growth reference documentation (research/R05 §2).
  it('example 1: boy 11 y, BMI 30 → z = 3.35 (above +3 SD correction)', () => {
    expect(lmsZScore(30, { l: -1.7862, m: 16.9392, s: 0.1107 })).toBeCloseTo(3.35, 2);
  });

  it('example 2: boy 16 y, BMI 14 → z = −3.80 (below −3 SD correction)', () => {
    const lms = { l: -1.3529, m: 20.4951, s: 0.12579 };
    // WHO publishes SD3neg = 15.11, SD2neg = 16.50 and z = −3.80 computed from these rounded values.
    expect(lmsValueAtZ(lms, -3)).toBeCloseTo(15.11, 2);
    expect(lmsValueAtZ(lms, -2)).toBeCloseTo(16.5, 2);
    expect(Math.abs(lmsZScore(14, lms) + 3.8)).toBeLessThan(0.01);
  });

  it('example 3: boy 9 y, BMI 19 → z = 1.47 (classic LMS)', () => {
    expect(lmsZScore(19, { l: -1.6318, m: 16.049, s: 0.10038 })).toBeCloseTo(1.47, 2);
  });

  it('handles L = 0 (log-normal case) and round-trips value ↔ z', () => {
    const lms = { l: 0, m: 16, s: 0.1 };
    expect(lmsZScore(lmsValueAtZ(lms, 1.5), lms)).toBeCloseTo(1.5, 9);
    const lms2 = { l: -1.2, m: 18, s: 0.12 };
    expect(lmsZScore(lmsValueAtZ(lms2, -2.5), lms2)).toBeCloseTo(-2.5, 9);
  });

  it('maps z to the WHO 5–19 categories', () => {
    expect(childBmiCategory(-3.1)).toBe('severeThinness');
    expect(childBmiCategory(-2.5)).toBe('thinness');
    expect(childBmiCategory(0)).toBe('normal');
    expect(childBmiCategory(1)).toBe('normal');
    expect(childBmiCategory(1.5)).toBe('overweight');
    expect(childBmiCategory(2.01)).toBe('obesity');
  });
});
