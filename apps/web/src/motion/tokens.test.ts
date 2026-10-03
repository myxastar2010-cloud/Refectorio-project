import { describe, expect, it } from 'vitest';
import css from '../styles/tokens.css?raw';
import { DIALOG } from './tokens';

/** A unitless custom property from tokens.css, e.g. `--radius-tile: 45;`. */
function cssNumber(name: string): number {
  const start = css.indexOf(`${name}:`);
  if (start < 0) return Number.NaN;
  const end = css.indexOf(';', start);
  return Number(css.slice(start + name.length + 1, end).trim());
}

describe('motion tokens mirror the CSS tokens', () => {
  it('radii of the team card (tile and dialog)', () => {
    expect(cssNumber('--radius-tile')).toBe(DIALOG.tileRadius);
    expect(cssNumber('--radius-dialog')).toBe(DIALOG.dialogRadius);
  });
});
