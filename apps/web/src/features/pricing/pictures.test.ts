import { describe, expect, it } from 'vitest';
import { pickOther, pickPictures } from './pictures';

/** mulberry32: repeatable «random» visits. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const number = (file: string, kind: string) => new RegExp(`/${kind}-(\\d)-407\\.`).exec(file)?.[1];

describe('pickOther', () => {
  it('never repeats the previous card and reaches every other one', () => {
    for (let previous = 0; previous < 6; previous += 1) {
      const seen = new Set<number>();
      for (let step = 0; step < 5; step += 1) seen.add(pickOther(6, previous, () => step / 5));
      expect(seen).toEqual(new Set([0, 1, 2, 3, 4, 5].filter((index) => index !== previous)));
    }
  });

  it('takes any card on the first visit, and the only one when there is one', () => {
    expect(pickOther(6, null, () => 0)).toBe(0);
    expect(pickOther(6, null, () => 0.999)).toBe(5);
    expect(pickOther(1, 0, () => 0.5)).toBe(0);
  });
});

describe('pickPictures', () => {
  it('gives every visit another free and another Premium card; «Ещё...» blurs the same Premium card', () => {
    const random = seeded(2107);
    let previous = pickPictures(random);
    const free = new Set<string>();
    for (let visit = 0; visit < 200; visit += 1) {
      const next = pickPictures(random);
      expect(next.free.webp).not.toBe(previous.free.webp);
      expect(next.premium.webp).not.toBe(previous.premium.webp);
      expect(number(next.premiumOpen.webp, 'premium-open')).toBe(
        number(next.premium.webp, 'premium'),
      );
      expect(number(next.premiumOpen.avif, 'premium-open')).toBe(
        number(next.premium.avif, 'premium'),
      );
      free.add(next.free.webp);
      previous = next;
    }
    // All six pictures of each plan come up.
    expect(free.size).toBe(6);
  });
});
