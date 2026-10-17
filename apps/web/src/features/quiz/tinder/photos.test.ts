import { describe, expect, it } from 'vitest';
import { hexLuminance, HOTLINKED, photosFor, tintFor } from './photos';

describe('dish photos', () => {
  it('a dish without a photo gets the generated placeholder only', () => {
    expect(photosFor('d_no_such_dish')).toEqual({
      sources: [],
      blurhash: null,
      avgColor: null,
      blurred: null,
    });
  });

  it('a curated dish is served from our own origin in three widths, AVIF and WebP, with no credit (ADR 0011)', () => {
    expect(HOTLINKED).toBe(false);
    const photos = photosFor('d_oatmeal');
    const [first] = photos.sources;
    expect(photos.sources).toHaveLength(1);
    expect(first?.src).toBe('/dish-photos/unsplash-5gTixp6KwtI-f500x444-v1-720.webp');
    expect(first?.srcSet.split(', ')).toHaveLength(3);
    expect(first?.avifSrcSet?.split(', ')).toEqual([
      '/dish-photos/unsplash-5gTixp6KwtI-f500x444-v1-480.avif 480w',
      '/dish-photos/unsplash-5gTixp6KwtI-f500x444-v1-720.avif 720w',
      '/dish-photos/unsplash-5gTixp6KwtI-f500x444-v1-960.avif 960w',
    ]);
    // Nothing points to a third-party host, and there is nothing to credit under the card.
    for (const url of [first?.src, first?.srcSet, first?.avifSrcSet]) {
      expect(url).not.toMatch(/https?:/);
    }
    expect(first?.credit).toBeUndefined();
    expect(photos.blurred).toBe('/dish-photos/unsplash-5gTixp6KwtI-f500x444-v1-blur.webp');
    expect(photos.blurhash).toMatch(/^.{6,}$/);
  });

  it('the tint under the white dish name reaches 4.5:1 on light photos and keeps its minimum on dark ones', () => {
    const contrast = (background: number) => 1.05 / (background + 0.05);
    for (const luminance of [0.3, 0.6, 0.9]) {
      const tint = tintFor(luminance, 0.36);
      // sRGB blending darkens the top more than this linear estimate: the estimate is the safe side.
      expect(contrast(luminance * (1 - tint))).toBeGreaterThanOrEqual(4.5);
    }
    expect(tintFor(0.05, 0.36)).toBe(0.36);
    expect(tintFor(1, 0.36)).toBeLessThanOrEqual(0.85);
  });

  it('luminance of hex colours', () => {
    expect(hexLuminance('#ffffff')).toBeCloseTo(1);
    expect(hexLuminance('#000000')).toBe(0);
  });
});
