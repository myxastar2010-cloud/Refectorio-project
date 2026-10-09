import { describe, expect, it } from 'vitest';
import { bigEnough, rankCandidates, rejected, scoreCandidate } from './filter.mjs';

const photo = (overrides) => ({
  provider: 'pexels',
  id: '1',
  width: 3000,
  height: 4000,
  alt: 'bowl of borscht soup with sour cream',
  src: 'https://images.pexels.com/photos/1/a.jpeg',
  thumb: 'https://images.pexels.com/photos/1/a.jpeg?w=350',
  likes: null,
  ...overrides,
});
const queries = ['borscht soup bowl', 'beet soup sour cream'];

describe('photo candidate filter', () => {
  it('rejects people, text, alcohol and raw ingredients', () => {
    expect(rejected(photo({ alt: 'woman eating soup' }), queries)).toBe(true);
    expect(rejected(photo({ alt: 'soup with a menu sign' }), queries)).toBe(true);
    expect(rejected(photo({ alt: 'soup and a glass of wine' }), queries)).toBe(true);
    expect(rejected(photo({ alt: 'raw ingredients for borscht' }), queries)).toBe(true);
    expect(rejected(photo({}), queries)).toBe(false);
  });

  it('lets raw dishes be raw', () => {
    expect(rejected(photo({ alt: 'sushi rolls with raw ingredients' }), ['sushi rolls'])).toBe(
      false,
    );
  });

  it('needs a short side of at least 1200 px', () => {
    expect(bigEnough(photo({ width: 1199 }))).toBe(false);
    expect(bigEnough(photo({ width: 1200, height: 1800 }))).toBe(true);
  });

  it('scores relevant portrait photos higher', () => {
    const relevant = scoreCandidate(photo({}), queries);
    expect(scoreCandidate(photo({ alt: 'a plate of food' }), queries)).toBeLessThan(relevant);
    expect(scoreCandidate(photo({ width: 4000, height: 3000 }), queries)).toBeLessThan(relevant);
  });

  it('ranks: filtered, de-duplicated, top N by score', () => {
    const ranked = rankCandidates(
      [
        photo({ id: '1' }),
        photo({ id: '1' }),
        photo({ id: '2', alt: 'food' }),
        photo({ id: '3', alt: 'man with borscht' }),
        photo({ id: '4', width: 800 }),
        photo({ id: '5', thumb: null }),
      ],
      queries,
      6,
    );
    expect(ranked.map((p) => p.id)).toEqual(['1', '2']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });
});
