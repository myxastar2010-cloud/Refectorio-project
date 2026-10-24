import { describe, expect, it } from 'vitest';
import { FIT, roundFit, solveFit, tooSmallToFit } from './fit';

/** A step whose height is a fixed part plus a part that scales with the fit (floors flatten it below `floorAt`). */
const step = (fixed: number, scaled: number, floorAt = 0) => {
  const calls: number[] = [];
  const measure = (fit: number) => {
    calls.push(fit);
    return fixed + scaled * Math.max(fit, floorAt);
  };
  return { measure, calls };
};

describe('the fit solver (4.11)', () => {
  it('a step that fits keeps its full size after one measure', () => {
    const { measure, calls } = step(100, 500);
    expect(solveFit(measure, 700)).toEqual({ fit: 1, fits: true, passes: 1 });
    expect(calls).toEqual([1]);
  });

  it('finds the largest fit in 0.01 steps within three passes, and it really fits', () => {
    for (const available of [330, 420, 555, 599]) {
      const { measure, calls } = step(120, 480);
      const result = solveFit(measure, available);
      expect(result.fits).toBe(true);
      expect(calls.length).toBeLessThanOrEqual(3);
      expect(measure(result.fit)).toBeLessThanOrEqual(available + FIT.tolerancePx);
      // On a straight line the chord is the line: the largest fit, to its step.
      const best = (available - 120) / 480;
      expect(best - result.fit).toBeLessThan(FIT.step + 1e-9);
      expect(result.fit).toBe(Math.round(result.fit * 100) / 100);
    }
  });

  it('floors flatten the line: the chord still lands on a fit that fits, or an honest «does not fit»', () => {
    const tight = step(200, 400, 0.7);
    const result = solveFit(tight.measure, 420);
    expect(result.fits).toBe(false);
    expect(tight.calls.length).toBeLessThanOrEqual(3);
    for (const available of [470, 520, 580]) {
      const easy = step(200, 400, 0.6);
      const fitted = solveFit(easy.measure, available);
      expect(fitted.fits).toBe(true);
      expect(easy.calls.length).toBeLessThanOrEqual(3);
      expect(easy.measure(fitted.fit)).toBeLessThanOrEqual(available + FIT.tolerancePx);
    }
  });

  it('a height that grows again as the fit shrinks does not drop the step to the smallest fit', () => {
    // The dish card takes the room the rest gives up: near the full size the step gets taller as the fit shrinks.
    const measure = (fit: number) => (fit > 0.95 ? 826 + (1 - fit) * 400 : 400 + fit * 440);
    const result = solveFit(measure, 820);
    expect(result.fit).toBeGreaterThan(0.85);
    expect(measure(result.fit)).toBeLessThanOrEqual(821);
    expect(result.passes).toBeLessThanOrEqual(FIT.maxPasses);
  });

  it('never goes below the minimum fit or above 1', () => {
    expect(roundFit(0.1)).toBe(FIT.min);
    expect(roundFit(1.4)).toBe(1);
    expect(roundFit(0.876)).toBe(0.87);
  });

  it('only a window lower than 300 px or narrower than 320 px (a 400 % zoom) may scroll instead', () => {
    expect(tooSmallToFit(384, 182)).toBe(true);
    expect(tooSmallToFit(768, 365)).toBe(false);
    expect(tooSmallToFit(844, 340)).toBe(false);
    expect(tooSmallToFit(300, 600)).toBe(true);
  });
});
