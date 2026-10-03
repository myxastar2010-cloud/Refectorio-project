import { describe, expect, it } from 'vitest';
import {
  harrisBenedictRevisedKcal,
  katchMcArdleKcal,
  mifflinStJeorKcal,
  schofieldKcal,
} from './bmr';

const man = { weightKg: 70, heightCm: 175, ageYears: 30, sex: 'male' } as const;
const woman = { weightKg: 60, heightCm: 165, ageYears: 25, sex: 'female' } as const;

describe('Mifflin–St Jeor (Mifflin 1990)', () => {
  it('matches the original published coefficients for men and women', () => {
    // 9.99·70 + 6.25·175 − 4.92·30 + 5 = 1650.45
    expect(mifflinStJeorKcal(man)).toBeCloseTo(1650.45, 6);
    // 9.99·60 + 6.25·165 − 4.92·25 − 161 = 1346.65
    expect(mifflinStJeorKcal(woman)).toBeCloseTo(1346.65, 6);
  });

  it('stays within 5 kcal of the popular rounded form (10, 6.25, 5)', () => {
    const rounded = 10 * 70 + 6.25 * 175 - 5 * 30 + 5;
    expect(Math.abs(mifflinStJeorKcal(man) - rounded)).toBeLessThan(5);
  });

  it('uses the mean sex constant (−78) when sex is unspecified', () => {
    const unspecified = mifflinStJeorKcal({ ...man, sex: 'unspecified' });
    expect(unspecified).toBeCloseTo(1650.45 - 5 - 78, 6);
  });

  it('grows with weight and height and falls with age', () => {
    expect(mifflinStJeorKcal({ ...man, weightKg: 71 })).toBeGreaterThan(mifflinStJeorKcal(man));
    expect(mifflinStJeorKcal({ ...man, heightCm: 176 })).toBeGreaterThan(mifflinStJeorKcal(man));
    expect(mifflinStJeorKcal({ ...man, ageYears: 31 })).toBeLessThan(mifflinStJeorKcal(man));
  });
});

describe('Harris–Benedict revised (Roza & Shizgal 1984)', () => {
  it('matches the published coefficients', () => {
    // 88.362 + 13.397·70 + 4.799·175 − 5.677·30
    expect(harrisBenedictRevisedKcal(man)).toBeCloseTo(1695.667, 3);
    // 447.593 + 9.247·60 + 3.098·165 − 4.330·25
    expect(harrisBenedictRevisedKcal(woman)).toBeCloseTo(1405.333, 3);
    expect(harrisBenedictRevisedKcal({ ...man, sex: 'unspecified' })).toBeCloseTo(
      (1695.667 + harrisBenedictRevisedKcal({ ...man, sex: 'female' })) / 2,
      3,
    );
  });
});

describe('Katch–McArdle / Cunningham 1991', () => {
  it('uses lean body mass', () => {
    // LBM = 70 · 0.8 = 56 → 370 + 21.6 · 56 = 1579.6
    expect(katchMcArdleKcal({ weightKg: 70, bodyFatPct: 20 })).toBeCloseTo(1579.6, 6);
  });
});

describe('Schofield (FAO/WHO/UNU 2004, table 5.2)', () => {
  it('picks the age band', () => {
    expect(schofieldKcal({ weightKg: 70, ageYears: 25, sex: 'male' })).toBeCloseTo(
      15.057 * 70 + 692.2,
      6,
    );
    expect(schofieldKcal({ weightKg: 60, ageYears: 45, sex: 'female' })).toBeCloseTo(
      8.126 * 60 + 845.6,
      6,
    );
    expect(schofieldKcal({ weightKg: 12, ageYears: 2, sex: 'male' })).toBeCloseTo(
      59.512 * 12 - 30.4,
      6,
    );
    expect(schofieldKcal({ weightKg: 65, ageYears: 70, sex: 'unspecified' })).toBeCloseTo(
      (11.711 * 65 + 587.7 + 9.082 * 65 + 658.5) / 2,
      6,
    );
  });

  it('returns NaN for a NaN age', () => {
    expect(schofieldKcal({ weightKg: 60, ageYears: Number.NaN, sex: 'female' })).toBeNaN();
  });
});
