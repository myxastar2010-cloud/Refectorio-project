import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { photoFileBase as browserFileBase } from '../../packages/taste-core/src/photos.ts';
import { photoFileBase, photoFiles } from './files.mjs';
import { MANIFEST_FILE } from './lib.mjs';
import { downloadUrl, manifestHash, photosOf, tooManyMissing } from './materialize.mjs';

const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'));
const photos = photosOf(manifest);

describe('self-hosted dish photo files', () => {
  it('the build and the browser name every file the same way', () => {
    for (const photo of photos) expect(photoFileBase(photo)).toBe(browserFileBase(photo));
  });

  it('names never collide, even on a case-insensitive disk (Windows)', () => {
    const names = photos.map((photo) => photoFileBase(photo).toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('a changed crop is a new file name (cached copies are never stale)', () => {
    const photo = { provider: 'unsplash', id: 'abc', focal: { x: 0.5, y: 0.444 } };
    expect(photoFileBase(photo)).toBe('unsplash-abc-f500x444-v1');
    expect(photoFileBase({ ...photo, focal: { x: 0.5, y: 0.45 } })).not.toBe(photoFileBase(photo));
    expect(photoFiles(photo)).toEqual([
      'unsplash-abc-f500x444-v1-480.avif',
      'unsplash-abc-f500x444-v1-480.webp',
      'unsplash-abc-f500x444-v1-720.avif',
      'unsplash-abc-f500x444-v1-720.webp',
      'unsplash-abc-f500x444-v1-960.avif',
      'unsplash-abc-f500x444-v1-960.webp',
      'unsplash-abc-f500x444-v1-blur.webp',
    ]);
  });

  it('every photo of the manifest is built, and the stamp changes with any of them', () => {
    expect(photos.length).toBe(Object.keys(manifest.photos).length);
    const hash = manifestHash(photos);
    const moved = photos.map((photo, i) =>
      i === 0 ? { ...photo, focal: { x: photo.focal.x, y: 1 - photo.focal.y } } : photo,
    );
    expect(manifestHash(moved)).not.toBe(hash);
    expect(manifestHash([...photos].reverse())).toBe(hash);
  });

  it('downloads a plain JPEG from Unsplash and keeps its ixid', () => {
    const url = new URL(downloadUrl(photos[0]));
    expect(url.hostname).toBe('images.unsplash.com');
    expect(url.searchParams.get('fm')).toBe('jpg');
    expect(url.searchParams.get('w')).toBe('1920');
    expect(url.searchParams.has('ixid')).toBe(true);
  });

  it('a production build tolerates up to 5 % of missing photos', () => {
    expect(tooManyMissing(8, 171)).toBe(false);
    expect(tooManyMissing(9, 171)).toBe(true);
    expect(tooManyMissing(0, 0)).toBe(false);
  });
});
