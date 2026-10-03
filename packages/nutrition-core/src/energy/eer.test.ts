import { describe, expect, it } from 'vitest';
import { eerChildKcal } from './eer';

describe('EER NASEM 2023 for children and adolescents', () => {
  it('matches the published equations including energy deposition', () => {
    // Boy, low active: 19.12 + 3.68·10 + 8.62·140 + 20.28·32 + 25
    expect(
      eerChildKcal({ ageYears: 10, heightCm: 140, weightKg: 32, sex: 'male', activity: 'kfa2' }),
    ).toBeCloseTo(19.12 + 36.8 + 1206.8 + 648.96 + 25, 6);
    // Girl, active: −189.55 − 22.25·15 + 11.74·162 + 18.34·52 + 20
    expect(
      eerChildKcal({ ageYears: 15, heightCm: 162, weightKg: 52, sex: 'female', activity: 'kfa3' }),
    ).toBeCloseTo(-189.55 - 333.75 + 1901.88 + 953.68 + 20, 6);
  });

  it('averages both equations when sex is unspecified', () => {
    const base = { ageYears: 7, heightCm: 122, weightKg: 23, activity: 'kfa1' } as const;
    const male = eerChildKcal({ ...base, sex: 'male' });
    const female = eerChildKcal({ ...base, sex: 'female' });
    expect(eerChildKcal({ ...base, sex: 'unspecified' })).toBeCloseTo((male + female) / 2, 6);
  });

  it('is defined only for 3 ≤ age < 19', () => {
    const base = { heightCm: 100, weightKg: 15, sex: 'male', activity: 'kfa2' } as const;
    expect(eerChildKcal({ ...base, ageYears: 2.9 })).toBeNaN();
    expect(eerChildKcal({ ...base, ageYears: 19 })).toBeNaN();
    expect(eerChildKcal({ ...base, ageYears: 3 })).toBeGreaterThan(0);
  });

  it('increases with activity level', () => {
    const levels = (['kfa1', 'kfa2', 'kfa3', 'kfa4'] as const).map((activity) =>
      eerChildKcal({ ageYears: 12, heightCm: 150, weightKg: 40, sex: 'female', activity }),
    );
    for (let i = 1; i < levels.length; i += 1)
      expect(levels[i]).toBeGreaterThan(levels[i - 1] ?? Infinity);
  });
});
