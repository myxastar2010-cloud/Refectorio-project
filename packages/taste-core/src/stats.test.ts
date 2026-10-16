import { describe, expect, it } from 'vitest';
import { createRandom, hashUnit } from './random';
import {
  bald,
  entropyBits,
  erfc,
  logit,
  millsRatio,
  normalCdf,
  normalPdf,
  predictiveProbability,
  sigmoid,
} from './stats';

describe('stats', () => {
  it('sigmoid and logit are inverse and stable at the extremes', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(logit(sigmoid(1.7))).toBeCloseTo(1.7, 10);
    expect(sigmoid(-800)).toBe(0);
    expect(sigmoid(800)).toBe(1);
  });

  it('erfc and Φ match reference values (Abramowitz & Stegun table 7.1, 26.1)', () => {
    expect(erfc(0)).toBeCloseTo(1, 7);
    expect(erfc(0.5)).toBeCloseTo(0.4795001222, 7);
    expect(erfc(-1)).toBeCloseTo(1.8427007929, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021, 6);
    expect(normalCdf(-3)).toBeCloseTo(0.0013499, 6);
    expect(normalPdf(0)).toBeCloseTo(0.3989423, 7);
  });

  it('the inverse Mills ratio is continuous across its two branches and tends to −z', () => {
    expect(millsRatio(0)).toBeCloseTo(0.7978846, 6);
    expect(Math.abs(millsRatio(-8.0001) - millsRatio(-7.9999))).toBeLessThan(1e-3);
    expect(millsRatio(-40)).toBeCloseTo(40.025, 2);
    expect(millsRatio(6)).toBeCloseTo(0, 6);
  });

  it('binary entropy is 1 bit at 0.5 and 0 at certainty', () => {
    expect(entropyBits(0.5)).toBeCloseTo(1, 12);
    expect(entropyBits(0)).toBe(0);
    expect(entropyBits(1)).toBe(0);
    expect(entropyBits(0.11)).toBeCloseTo(0.4999, 3);
  });

  it('predictive probability shrinks towards 0.5 with uncertainty', () => {
    expect(predictiveProbability(2, 0)).toBeCloseTo(sigmoid(2), 12);
    expect(predictiveProbability(2, 4)).toBeLessThan(predictiveProbability(2, 1));
    expect(predictiveProbability(2, 4)).toBeGreaterThan(0.5);
    expect(predictiveProbability(0, 9)).toBe(0.5);
  });

  it('BALD: zero without epistemic uncertainty, grows with it, prefers undecided means', () => {
    expect(bald(0, 0)).toBeCloseTo(0, 3);
    expect(bald(0, 4)).toBeGreaterThan(bald(0, 1));
    expect(bald(0, 2)).toBeGreaterThan(bald(3, 2));
    // Noise-only uncertainty (mean 0, no variance) is worthless; plain uncertainty sampling would pick it.
    expect(bald(0, 0.01)).toBeLessThan(bald(1.5, 2));
    expect(bald(0, 1e6)).toBeLessThanOrEqual(1);
  });

  it('BALD agrees with Monte Carlo mutual information', () => {
    const random = createRandom(7);
    for (const [mean, variance] of [
      [0, 1],
      [1, 2],
      [-2, 0.5],
    ] as const) {
      let expected = 0;
      let marginal = 0;
      const n = 40000;
      for (let i = 0; i < n; i += 1) {
        const p = sigmoid(mean + Math.sqrt(variance) * random.normal());
        expected += entropyBits(p) / n;
        marginal += p / n;
      }
      expect(bald(mean, variance)).toBeCloseTo(entropyBits(marginal) - expected, 1);
    }
  });
});

describe('random', () => {
  it('is deterministic per seed and roughly uniform', () => {
    const a = createRandom(1);
    const b = createRandom(1);
    const values = Array.from({ length: 2000 }, () => a.next());
    expect(values.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b.next()));
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(createRandom(3).int(10)).toBeLessThan(10);
  });

  it('hashUnit is stateless, in [0, 1) and differs between inputs', () => {
    expect(hashUnit(5, 'd_borscht', 3)).toBe(hashUnit(5, 'd_borscht', 3));
    expect(hashUnit(5, 'd_borscht', 3)).not.toBe(hashUnit(6, 'd_borscht', 3));
    expect(hashUnit(5, 'd_borscht', 3)).not.toBe(hashUnit(5, 'd_borscht', 4));
    const values = Array.from({ length: 1000 }, (_, i) => hashUnit(9, i));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.05);
  });
});
