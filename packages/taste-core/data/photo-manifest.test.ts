import { describe, expect, it } from 'vitest';
import { catalogSchema } from '../src/catalog';
import { photoManifestSchema, photoSchema } from '../src/photos';
import catalogJson from './catalog.json';
import manifestJson from './photo-manifest.json';
import overridesJson from './photo-overrides.json';

const catalog = catalogSchema.parse(catalogJson);
const manifest = photoManifestSchema.parse(manifestJson);

describe('photo manifest', () => {
  it('only describes catalog dishes', () => {
    const ids = new Set(catalog.dishes.map((d) => d.id));
    for (const id of Object.keys(manifest.photos)) expect(ids.has(id), id).toBe(true);
  });

  it('every photo has a credit, a placeholder hash and a valid chain', () => {
    for (const [id, set] of Object.entries(manifest.photos)) {
      expect(set.primary.author, id).not.toBe('');
      expect(set.primary.blurhash.length, id).toBeGreaterThanOrEqual(6);
      // A fallback is a second provider, never the same one.
      if (set.fallback) expect(set.fallback.provider, id).not.toBe(set.primary.provider);
    }
  });

  it('overrides pin photos by provider and id', () => {
    const pins: Record<string, { provider: string; id: string }> = overridesJson;
    for (const [id, pin] of Object.entries(pins)) {
      expect(id).toMatch(/^d_/);
      expect(['pexels', 'unsplash']).toContain(pin.provider);
    }
  });
});

describe('photo schema rules', () => {
  const unsplash = {
    provider: 'unsplash',
    id: 'abc',
    pageUrl: 'https://unsplash.com/photos/abc?utm_source=refectorio&utm_medium=referral',
    author: 'Jane Doe',
    authorUrl: 'https://unsplash.com/@jane?utm_source=refectorio&utm_medium=referral',
    src: 'https://images.unsplash.com/photo-1?ixid=M3w&ixlib=rb-4.0.3',
    width: 3000,
    height: 4000,
    focal: { x: 0.5, y: 0.5 },
    avgColor: '#a07050',
    blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
    altRu: 'Тарелка борща со сметаной',
    chosenAt: '2026-10-09',
    downloadTrackedAt: '2026-10-09',
  } as const;

  it('accepts a correct Unsplash hotlink with credits', () => {
    expect(photoSchema.safeParse(unsplash).success).toBe(true);
  });

  it('requires ixid, the Unsplash CDN and utm links', () => {
    expect(
      photoSchema.safeParse({ ...unsplash, src: 'https://images.unsplash.com/photo-1' }).success,
    ).toBe(false);
    expect(
      photoSchema.safeParse({ ...unsplash, src: 'https://example.com/a.jpg?ixid=1' }).success,
    ).toBe(false);
    expect(
      photoSchema.safeParse({ ...unsplash, authorUrl: 'https://unsplash.com/@jane' }).success,
    ).toBe(false);
  });

  it('Pexels photos come from the Pexels CDN', () => {
    const pexels = {
      ...unsplash,
      provider: 'pexels',
      pageUrl: 'https://www.pexels.com/photo/1/',
      authorUrl: 'https://www.pexels.com/@x',
      src: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg',
    };
    expect(photoSchema.safeParse(pexels).success).toBe(true);
    expect(photoSchema.safeParse({ ...pexels, src: 'https://example.com/1.jpg' }).success).toBe(
      false,
    );
  });
});
