import { describe, expect, it } from 'vitest';
import { MICRONUTRIENT_KEYS, micronutrientNorms } from './micronutrients';

const person = (over: Partial<Parameters<typeof micronutrientNorms>[0]>) =>
  micronutrientNorms({
    ageYears: 30,
    sex: 'male',
    pregnancy: 'none',
    lactation: 'none',
    ...over,
  });

describe('micronutrientNorms (МР 2.3.1.0253-21)', () => {
  it('adult men: tables 11–12, NASEM upper limits', () => {
    const n = person({});
    expect(n.ironMg).toEqual({ norm: 10, ul: 45, ulScope: 'total' });
    expect(n.calciumMg?.norm).toBe(1000);
    expect(n.vitaminDUg?.norm).toBe(15);
    expect(n.magnesiumMg).toEqual({ norm: 420, ul: 350, ulScope: 'supplementsOnly' });
    expect(n.vitaminAUg?.ulScope).toBe('preformedOnly');
  });

  it('adult women: iron 18 mg (table 17)', () => {
    expect(person({ sex: 'female' }).ironMg?.norm).toBe(18);
  });

  it('65+: more calcium and vitamin D (notes to tables 11–12, 16–17)', () => {
    const n = person({ ageYears: 70, sex: 'female' });
    expect(n.calciumMg?.norm).toBe(1200);
    expect(n.vitaminDUg?.norm).toBe(20);
  });

  it('pregnancy and lactation use table 20 (absolute norms)', () => {
    const second = person({ sex: 'female', pregnancy: 'trimester2' });
    expect(second.ironMg?.norm).toBe(33);
    expect(second.folateUgDfe?.norm).toBe(600);
    expect(person({ sex: 'female', lactation: 'months0to6' }).iodineUg?.norm).toBe(290);
  });

  it('children: table 21 without adult upper limits; ambiguous cells stay unknown', () => {
    const boy = person({ ageYears: 12 });
    expect(boy.calciumMg).toEqual({ norm: 1200 });
    expect(boy.ironMg).toBeUndefined();
  });

  it('upper limits follow the NASEM bands: 51+, over 70, pregnancy, 14–18 (Appendix J)', () => {
    expect(person({}).calciumMg?.ul).toBe(2500);
    expect(person({ ageYears: 51 }).calciumMg?.ul).toBe(2000);
    expect(person({ ageYears: 70 }).phosphorusMg?.ul).toBe(4000);
    expect(person({ ageYears: 71 }).phosphorusMg?.ul).toBe(3000);
    const pregnant = person({ sex: 'female', pregnancy: 'trimester1' });
    expect(pregnant.phosphorusMg?.ul).toBe(3500);
    expect(person({ sex: 'female', lactation: 'months0to6' }).phosphorusMg?.ul).toBe(4000);
    // 18-year-olds belong to NASEM's 14–18 band: its own zinc and iodine limits, no adult limit elsewhere.
    const eighteen = person({ ageYears: 18 });
    expect(eighteen.zincMg?.ul).toBe(34);
    expect(eighteen.iodineUg?.ul).toBe(900);
    expect(eighteen.calciumMg?.ul).toBeUndefined();
    expect(person({ ageYears: 18, sex: 'female', pregnancy: 'trimester2' }).zincMg?.ul).toBe(34);
  });

  it('unspecified sex takes the higher norm of the two', () => {
    expect(person({ sex: 'unspecified' }).ironMg?.norm).toBe(18);
  });

  it('gives only known keys with positive norms', () => {
    for (const ageYears of [2, 5, 9, 13, 16, 25, 70]) {
      for (const sex of ['male', 'female'] as const) {
        const n = person({ ageYears, sex });
        for (const [key, value] of Object.entries(n)) {
          expect(MICRONUTRIENT_KEYS).toContain(key);
          expect(value.norm).toBeGreaterThan(0);
        }
      }
    }
  });
});
