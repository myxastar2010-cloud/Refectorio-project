// Builds the self-hosted dish photos from the committed manifest (ТЗ §9.8 step 5). No keys needed.
// Runs before `vite build` and `vite dev` (apps/web prebuild/predev), in CI, on Render and in the Pages workflow.
//   node scripts/photos/materialize.mjs [--quick]
// Pexels photos only (Unsplash must be hotlinked): CDN copy at w=1920 (cached in .cache/dish-photos, gitignored) →
// 3:4 crop around the focal point → 480/720/960 AVIF + WebP in apps/web/public/dish-photos/ (gitignored) + index.json.
// A failed download writes nothing for that dish: the page falls back to Unsplash or the placeholder. The build never
// fails because of a photo, and --quick (predev) gives up at once when the CDN is unreachable from this computer
// (Pexels sits behind Cloudflare, throttled in Russia; CI and Render outside Russia materialize normally).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { cropBox, WIDTHS } from './crop.mjs';
import { APP_ROOT, fetchWithTimeout, MANIFEST_FILE, readJson, sizedUrl } from './lib.mjs';

const OUT_DIR = path.join(APP_ROOT, 'apps', 'web', 'public', 'dish-photos');
const CACHE = path.join(APP_ROOT, '.cache', 'dish-photos');
const AVIF = { quality: 52, effort: 5 };
const WEBP = { quality: 72, effort: 5 };

const quick = process.argv.includes('--quick');
const timeoutMs = quick ? 4000 : 20_000;

async function source(photo) {
  const file = path.join(CACHE, `pexels-${photo.id}.jpg`);
  if (existsSync(file)) return readFile(file);
  const response = await fetchWithTimeout(sizedUrl(photo, 1920), {}, timeoutMs);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, buffer);
  return buffer;
}

async function main() {
  const manifest = await readJson(MANIFEST_FILE, { photos: {} });
  const pexels = Object.entries(manifest.photos).filter(
    ([, set]) => set.primary?.provider === 'pexels',
  );
  await mkdir(OUT_DIR, { recursive: true });
  const index = { version: 1, widths: WIDTHS, files: {} };
  let failed = 0;
  let unreachable = false;
  for (const [dishId, set] of pexels) {
    const photo = set.primary;
    // Content hash in the file name: a re-picked photo never meets a stale cache.
    const hash = createHash('sha1')
      .update(`${photo.id}:${photo.focal.x}:${photo.focal.y}`)
      .digest('hex')
      .slice(0, 8);
    const ready = WIDTHS.every((w) =>
      existsSync(path.join(OUT_DIR, `${dishId}-${hash}-${w}.avif`)),
    );
    if (ready) {
      index.files[dishId] = hash;
      continue;
    }
    if (unreachable) continue;
    try {
      const buffer = await source(photo);
      const meta = await sharp(buffer).metadata();
      const box = cropBox(meta.width, meta.height, photo.focal);
      for (const width of WIDTHS) {
        const pipeline = sharp(buffer)
          .extract(box)
          .resize(width, Math.round((width * 4) / 3));
        await writeFile(
          path.join(OUT_DIR, `${dishId}-${hash}-${width}.avif`),
          await pipeline.clone().avif(AVIF).toBuffer(),
        );
        await writeFile(
          path.join(OUT_DIR, `${dishId}-${hash}-${width}.webp`),
          await pipeline.clone().webp(WEBP).toBuffer(),
        );
      }
      index.files[dishId] = hash;
    } catch {
      failed += 1;
      // The first failure in quick mode means the CDN is out of reach from here: don't wait on every photo.
      if (quick) unreachable = true;
    }
  }
  // Files of photos that are no longer in the manifest.
  const keep = new Set(Object.entries(index.files).map(([id, hash]) => `${id}-${hash}-`));
  for (const name of await readdir(OUT_DIR)) {
    if (name === 'index.json') continue;
    if (![...keep].some((prefix) => name.startsWith(prefix))) await rm(path.join(OUT_DIR, name));
  }
  await writeFile(path.join(OUT_DIR, 'index.json'), `${JSON.stringify(index)}\n`);
  const made = Object.keys(index.files).length;
  if (pexels.length > 0) {
    console.log(
      `Фото блюд: ${made} из ${pexels.length} (Pexels)${failed ? `, не скачано ${failed}${unreachable ? ' — CDN недоступен отсюда, на сайте будут запасные фото' : ''}` : ''}.`,
    );
  }
}

// Never fail the build because of photos.
await main().catch((error) => {
  console.log(`Фото блюд: пропущено (${error instanceof Error ? error.message : 'ошибка'}).`);
});
