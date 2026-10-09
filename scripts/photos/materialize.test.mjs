import { describe, expect, it } from 'vitest';
import { cropBox } from './crop.mjs';

describe('3:4 crop around the focal point', () => {
  it('portrait 2:3 keeps the full width and moves vertically', () => {
    expect(cropBox(1200, 1800, { x: 0.5, y: 0.5 })).toEqual({
      left: 0,
      top: 100,
      width: 1200,
      height: 1600,
    });
  });

  it('landscape crops the width and stays inside the image', () => {
    const box = cropBox(1920, 1280, { x: 0.95, y: 0.5 });
    expect(box.width).toBe(960);
    expect(box.height).toBe(1280);
    expect(box.left + box.width).toBeLessThanOrEqual(1920);
  });
});
