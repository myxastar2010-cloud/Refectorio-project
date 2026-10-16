import { describe, expect, it } from 'vitest';
import { auc, expectedBrier, ndcgAt, summarize } from './metrics';

describe('simulation metrics', () => {
  it('AUC: perfect, reversed, random ties, missing class', () => {
    expect(auc([0.1, 0.2, 0.8, 0.9], [false, false, true, true])).toBe(1);
    expect(auc([0.9, 0.8, 0.2, 0.1], [false, false, true, true])).toBe(0);
    expect(auc([0.5, 0.5, 0.5, 0.5], [false, true, false, true])).toBe(0.5);
    expect(auc([0.1, 0.2], [true, true])).toBeNaN();
    // One misordered pair out of four.
    expect(auc([0.1, 0.6, 0.5, 0.9], [false, false, true, true])).toBe(0.75);
  });

  it('NDCG@k with binary relevance', () => {
    expect(ndcgAt(2, [0.9, 0.8, 0.1], [true, true, false])).toBeCloseTo(1, 12);
    expect(ndcgAt(1, [0.9, 0.8, 0.1], [false, true, false])).toBe(0);
    // Relevant item at rank 2: (1/log2 3) / 1.
    expect(ndcgAt(2, [0.9, 0.8], [false, true])).toBeCloseTo(1 / Math.log2(3), 12);
    expect(ndcgAt(3, [0.1, 0.2], [false, false])).toBeNaN();
  });

  it('expected Brier: zero error leaves the irreducible p(1 − p)', () => {
    expect(expectedBrier([0.5, 1], [0.5, 1])).toBeCloseTo(0.125, 12);
    expect(expectedBrier([0, 1], [1, 0])).toBe(1);
  });

  it('summarize: mean and a 95 % interval, NaNs dropped', () => {
    const s = summarize([1, 2, 3, NaN]);
    expect(s.n).toBe(3);
    expect(s.mean).toBe(2);
    expect(s.high - s.mean).toBeCloseTo(1.96 * Math.sqrt(1 / 3), 12);
    expect(summarize([]).mean).toBeNaN();
  });
});
