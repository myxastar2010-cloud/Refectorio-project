import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MANIFEST_FILE, RUNTIME_MANIFEST_FILE } from './lib.mjs';
import { RUNTIME_FIELDS, runtimeManifest } from './runtime.mjs';

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

describe("the site's copy of the photo manifest", () => {
  it('matches the manifest (finalize.mjs or runtime.mjs rewrites it)', () => {
    expect(read(RUNTIME_MANIFEST_FILE)).toEqual(runtimeManifest(read(MANIFEST_FILE)));
  });

  it('keeps only what the browser reads', () => {
    const copy = runtimeManifest({
      photos: {
        d_test: {
          primary: {
            provider: 'unsplash',
            id: 'x',
            pageUrl: 'https://unsplash.com/photos/x',
            author: 'A',
            authorUrl: 'https://unsplash.com/@a',
            src: 'https://images.unsplash.com/photo-1?ixid=1',
            width: 1000,
            height: 1500,
            focal: { x: 0.5, y: 0.4 },
            avgColor: '#123456',
            blurhash: 'LHHKwr,[s-nh',
            altRu: 'Тарелка каши',
            chosenAt: '2026-10-11',
            downloadTrackedAt: null,
          },
        },
      },
    });
    expect(Object.keys(copy.photos.d_test.primary)).toEqual(RUNTIME_FIELDS);
    // The photos are served from our own origin: no CDN address and no credit data in the browser (ADR 0011).
    for (const key of ['src', 'author', 'authorUrl', 'pageUrl']) {
      expect(copy.photos.d_test.primary).not.toHaveProperty(key);
    }
    expect(copy.photos.d_test.fallback).toBeUndefined();
  });
});
