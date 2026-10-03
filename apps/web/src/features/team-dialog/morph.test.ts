import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  atRest,
  boxCorners,
  cornerSprings,
  openness,
  quadMatrix,
  stepCorner,
  type Corner,
  type MorphStyle,
  type Quad,
} from './morph';

const box = { left: 0, top: 0, width: 1400, height: 840 };

function expectCornersMapped(quad: Quad, w: number, h: number) {
  const m = quadMatrix(quad, w, h);
  const local: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  local.forEach(([x, y], i) => {
    const mapped = applyMatrix(m, x, y);
    expect(mapped.x).toBeCloseTo(quad[i]?.x ?? NaN, 6);
    expect(mapped.y).toBeCloseTo(quad[i]?.y ?? NaN, 6);
  });
}

describe('projective transform of the card', () => {
  it('maps the box onto itself as the identity', () => {
    expect(
      quadMatrix(boxCorners(box), box.width, box.height).map((n) => Number(n.toFixed(9))),
    ).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it('maps the corners onto a smaller rectangle (a plain scale and shift)', () => {
    expectCornersMapped(
      boxCorners({ left: 240, top: 130, width: 187, height: 187 }),
      box.width,
      box.height,
    );
  });

  it('maps the corners onto any convex quad (corners pulled differently)', () => {
    expectCornersMapped(
      [
        { x: 30, y: 12 },
        { x: 1290, y: -40 },
        { x: 1420, y: 900 },
        { x: -25, y: 780 },
      ],
      box.width,
      box.height,
    );
  });
});

describe('corner springs', () => {
  const style: MorphStyle = {
    near: { stiffness: 300, damping: 30 },
    far: { stiffness: 170, damping: 17 },
    lagS: 0.07,
    lead: 'far',
  };
  const tile = boxCorners({ left: 240, top: 560, width: 187, height: 187 });
  const dialog = boxCorners({ left: 260, top: 118, width: 1401, height: 844 });

  it('opening: the corner with the longest way starts first and is the softest', () => {
    const springs = cornerSprings(tile, dialog, style);
    const ways = tile.map((p, i) =>
      Math.hypot((dialog[i]?.x ?? 0) - p.x, (dialog[i]?.y ?? 0) - p.y),
    );
    const far = ways.indexOf(Math.max(...ways));
    const near = ways.indexOf(Math.min(...ways));
    expect(springs[far]?.delayS).toBe(0);
    expect(springs[far]?.stiffness).toBe(170);
    expect(springs[near]?.delayS).toBeCloseTo(0.07, 9);
    expect(springs[near]?.stiffness).toBe(300);
  });

  it('closing: the near corners snap back first', () => {
    const springs = cornerSprings(dialog, tile, { ...style, lead: 'near' });
    const ways = dialog.map((p, i) => Math.hypot((tile[i]?.x ?? 0) - p.x, (tile[i]?.y ?? 0) - p.y));
    expect(springs[ways.indexOf(Math.min(...ways))]?.delayS).toBe(0);
    expect(springs[ways.indexOf(Math.max(...ways))]?.delayS).toBeCloseTo(0.07, 9);
  });

  it('a spring brings a corner to rest at the target, with a light overshoot', () => {
    let corner: Corner = { x: 0, y: 0, vx: 0, vy: 0 };
    let peak = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      corner = stepCorner(corner, { x: 100, y: 50 }, { stiffness: 170, damping: 17 }, 1 / 60);
      peak = Math.max(peak, corner.x);
    }
    expect(atRest(corner, { x: 100, y: 50 }, 0.5)).toBe(true);
    expect(peak).toBeGreaterThan(100);
    expect(peak).toBeLessThan(115);
  });

  it('openness goes from 0 at the tile to 1 at the dialog', () => {
    const tileBox = { left: 240, top: 560, width: 187, height: 187 };
    const dialogBox = { left: 260, top: 118, width: 1401, height: 844 };
    expect(openness(boxCorners(tileBox), tileBox, dialogBox)).toBe(0);
    expect(openness(boxCorners(dialogBox), tileBox, dialogBox)).toBe(1);
    const half = { left: 250, top: 300, width: 794, height: 515.5 };
    expect(openness(boxCorners(half), tileBox, dialogBox)).toBeCloseTo(0.5, 6);
  });
});
