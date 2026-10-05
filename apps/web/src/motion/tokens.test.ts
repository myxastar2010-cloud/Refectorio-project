import { describe, expect, it } from 'vitest';
import css from '../styles/tokens.css?raw';
import { SCENE } from './tokens';

/** A unitless custom property from tokens.css, e.g. `--radius-tile: 45;`. */
function cssNumber(name: string): number {
  const start = css.indexOf(`${name}:`);
  if (start < 0) return Number.NaN;
  const end = css.indexOf(';', start);
  return Number(css.slice(start + name.length + 1, end).trim());
}

describe('motion tokens mirror the CSS tokens', () => {
  it('the food camera of part 2 (scale origin)', () => {
    const percent = (name: string) => Number(css.split(`${name}:`)[1]?.split('%')[0]);
    expect(percent('--food-about-origin-x') / 100).toBeCloseTo(SCENE.food.originX, 6);
    expect(percent('--food-about-origin-y') / 100).toBeCloseTo(SCENE.food.originY, 6);
    expect(cssNumber('--food-about-scale')).toBe(SCENE.food.scale);
  });
});
