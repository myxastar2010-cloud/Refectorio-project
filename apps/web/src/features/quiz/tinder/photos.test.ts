import { describe, expect, it } from 'vitest';
import { hexLuminance, photosFor, tintFor } from './photos';

describe('dish photos', () => {
  it('a dish without a photo gets the generated placeholder only', () => {
    expect(photosFor('d_no_such_dish')).toEqual({
      sources: [],
      blurhash: null,
      avgColor: null,
    });
  });

  it('a curated dish gets an Unsplash hotlink cropped around its focal point, in three widths', () => {
    const photos = photosFor('d_oatmeal');
    const [first] = photos.sources;
    expect(first?.provider).toBe('unsplash');
    const url = new URL(first?.src ?? '');
    expect(url.hostname).toBe('images.unsplash.com');
    // The view-tracking parameter of the API guidelines stays on every size.
    expect(url.searchParams.has('ixid')).toBe(true);
    expect(url.searchParams.get('fit')).toBe('crop');
    expect(url.searchParams.get('crop')).toBe('focalpoint');
    expect(first?.srcSet.split(', ')).toHaveLength(3);
    expect(first?.providerUrl).toContain('utm_source=refectorio');
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
