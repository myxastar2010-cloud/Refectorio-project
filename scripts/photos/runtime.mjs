// The site's copy of the photo manifest (ТЗ budget ≤ 25 KB gz): only the fields the photo chain reads in the browser.
// The manifest keeps the rest (sizes, page links, choice and tracking dates) for the scripts and the credits page.
// finalize.mjs writes it next to the manifest; `node scripts/photos/runtime.mjs` rewrites it from the manifest.
import { pathToFileURL } from 'node:url';
import { MANIFEST_FILE, readJson, RUNTIME_MANIFEST_FILE, writeJson } from './lib.mjs';

export const RUNTIME_FIELDS = [
  'provider',
  'id',
  'src',
  'author',
  'authorUrl',
  'focal',
  'avgColor',
  'blurhash',
];

const keep = (photo) => Object.fromEntries(RUNTIME_FIELDS.map((key) => [key, photo[key]]));

export function runtimeManifest(manifest) {
  return {
    version: 1,
    photos: Object.fromEntries(
      Object.entries(manifest.photos).map(([dishId, set]) => [
        dishId,
        set.fallback
          ? { primary: keep(set.primary), fallback: keep(set.fallback) }
          : { primary: keep(set.primary) },
      ]),
    ),
  };
}

export async function writeRuntimeManifest() {
  const manifest = await readJson(MANIFEST_FILE, { photos: {} });
  await writeJson(RUNTIME_MANIFEST_FILE, runtimeManifest(manifest));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeRuntimeManifest();
  console.log('photo-runtime.json обновлён');
}
