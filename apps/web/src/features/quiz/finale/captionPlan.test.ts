import { describe, expect, it } from 'vitest';
import { quiz } from '../../../content/quiz.ru';
import { FINALE } from '../../../motion/tokens';
import { captionDurationMs, captionsFor } from './captionPlan';

describe('finale captions', () => {
  it('follow the content order; numbers are swapped when de-emphasised (ТЗ §8.7)', () => {
    expect(captionsFor(false).map((c) => c.text)).toEqual(quiz.finale.captions.map((c) => c.text));
    const calm = captionsFor(true).map((c) => c.text);
    expect(calm).not.toContain(quiz.finale.captionsCalm.replace);
    expect(calm).toContain(quiz.finale.captionsCalm.with);
  });

  it('last 2.2–3.2 s each, a little irregular', () => {
    const durations = quiz.finale.captions.map((_, i) => captionDurationMs(i));
    for (const ms of durations) {
      expect(ms).toBeGreaterThanOrEqual(FINALE.captionMinMs);
      expect(ms).toBeLessThanOrEqual(FINALE.captionMaxMs);
    }
    expect(new Set(durations).size).toBeGreaterThan(4);
  });
});
