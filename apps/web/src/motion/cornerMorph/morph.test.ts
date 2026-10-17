import { describe, expect, it } from 'vitest';
import {
  apply3,
  applyMatrix,
  atRest,
  boxCorners,
  cornerSprings,
  invert3,
  mat3FromMatrix3d,
  matrix3dFromMat3,
  multiply3,
  openness,
  pictureFraming,
  pictureMapping,
  quadMatrix,
  similarity3,
  stepCorner,
  type CardPicture,
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

describe('the card picture: never distorted, docked on the icon, covering the card', () => {
  // The team picture: 958×1521, the icon is its square (138.5, 129, 694); open landscape cards show a band at 35.4 %.
  const picture: CardPicture = {
    width: 958,
    height: 1521,
    focusY: 0.3543,
    icon: { x: 138.5, y: 129, size: 694 },
  };
  const card = { width: 947, height: 570.5 };
  const tile = { left: 160, top: 300, width: 145, height: 145 };
  const { frame, icon } = pictureFraming(card.width, card.height, picture);
  const mapping = (quad: Quad, open: number) =>
    pictureMapping({ quad, box: card, tile, frame, icon, open, dockedBelow: 0.1 });

  it('homography helpers: inverse, product and the CSS matrix3d round trip', () => {
    const m = mat3FromMatrix3d(
      quadMatrix(
        [
          { x: 10, y: 20 },
          { x: 300, y: 5 },
          { x: 320, y: 260 },
          { x: 0, y: 240 },
        ],
        947,
        570.5,
      ),
    );
    const identity = multiply3(m, invert3(m));
    identity.forEach((value, i) => {
      expect(value).toBeCloseTo([1, 0, 0, 0, 1, 0, 0, 0, 1][i] ?? NaN, 9);
    });
    expect(mat3FromMatrix3d(matrix3dFromMat3(m))).toEqual(m);
  });

  it('a landscape card shows the band of the picture at its width; a phone card the whole picture', () => {
    expect(frame.left).toBeCloseTo(0, 6);
    expect(frame.width).toBeCloseTo(card.width, 6);
    expect(frame.top).toBeLessThan(0);
    const phone = pictureFraming(358, 568.4, picture);
    expect(phone.frame.top).toBeCloseTo(0, 1);
    expect(phone.frame.height).toBeCloseTo(568.4, 1);
    expect(phone.icon.width).toBeCloseTo((694 * 358) / 958, 1);
  });

  it('at the tile the icon square of the picture lies exactly on the tile', () => {
    const u = mapping(boxCorners(tile), 0);
    expect(u.x + u.scale * icon.left).toBeCloseTo(tile.left, 6);
    expect(u.y + u.scale * icon.top).toBeCloseTo(tile.top, 6);
    expect(u.scale * icon.width).toBeCloseTo(tile.width, 6);
  });

  it('open: the picture exactly as the CSS lays it out', () => {
    const u = mapping(boxCorners({ left: 0, top: 0, ...card }), 1);
    expect(u.scale).toBeCloseTo(1, 9);
    expect(u.x).toBeCloseTo(0, 9);
    expect(u.y).toBeCloseTo(0, 9);
  });

  it('on the way the picture covers the card, whatever the corners do', () => {
    const quads: Quad[] = [
      // wide and low: the far corners ran ahead
      [
        { x: 40, y: 280 },
        { x: 700, y: 120 },
        { x: 760, y: 470 },
        { x: 150, y: 470 },
      ],
      // still small but already stretched sideways
      [
        { x: 150, y: 295 },
        { x: 420, y: 290 },
        { x: 430, y: 450 },
        { x: 155, y: 452 },
      ],
      // tall and narrow
      [
        { x: 140, y: 40 },
        { x: 360, y: 60 },
        { x: 350, y: 560 },
        { x: 150, y: 540 },
      ],
    ];
    for (const quad of quads) {
      for (const open of [0, 0.05, 0.2, 0.5, 0.8]) {
        const u = mapping(quad, open);
        const left = u.x + u.scale * frame.left;
        const top = u.y + u.scale * frame.top;
        const right = left + u.scale * frame.width;
        const bottom = top + u.scale * frame.height;
        for (const corner of quad) {
          expect(corner.x).toBeGreaterThanOrEqual(left - 1e-6);
          expect(corner.x).toBeLessThanOrEqual(right + 1e-6);
          expect(corner.y).toBeGreaterThanOrEqual(top - 1e-6);
          expect(corner.y).toBeLessThanOrEqual(bottom + 1e-6);
        }
      }
    }
  });

  it('inside the squeezed card the picture lands on screen with no distortion', () => {
    const quad: Quad = [
      { x: 60, y: 250 },
      { x: 640, y: 150 },
      { x: 700, y: 480 },
      { x: 120, y: 470 },
    ];
    const card3 = mat3FromMatrix3d(quadMatrix(quad, card.width, card.height));
    const u = similarity3(mapping(quad, 0.4));
    // The picture's own transform: the card's inverse, then the similarity. On screen — just the similarity.
    const onScreen = multiply3(card3, multiply3(invert3(card3), u));
    for (const [x, y] of [
      [0, 0],
      [500, 0],
      [0, 800],
      [400, 300],
    ] as const) {
      const p = apply3(onScreen, x, y);
      const q = apply3(u, x, y);
      expect(p.x).toBeCloseTo(q.x, 6);
      expect(p.y).toBeCloseTo(q.y, 6);
    }
  });
});
