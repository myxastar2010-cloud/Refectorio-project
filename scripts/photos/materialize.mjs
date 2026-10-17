// Builds the self-hosted dish photos from the committed manifest (ADR 0011, D-048). No keys needed.
// Runs before `vite build` and `vite dev` (apps/web prebuild/predev), in CI, on Render and in the Pages workflow.
//   node scripts/photos/materialize.mjs [--quick]
// Every photo of the manifest (any provider): a CDN copy at w=1920 (.cache/dish-photos/src, gitignored) → 3:4 crop
// around the stored focal point → 480/720/960 AVIF + WebP and one tiny pre-blurred WebP (.cache/dish-photos/out) →
// copied to apps/web/public/dish-photos/ (gitignored; served from our own origin). Nothing of it ever goes into git.
// A stamp with the manifest's hash skips the whole run when nothing changed.
// Full mode (prebuild) fails the build when more than 5 % of the photos are missing; --quick (predev) never fails and
// gives up at once when the CDN is out of reach from this computer, so `npm run dev` never stalls on a slow network.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { cropBox } from './crop.mjs';
import { BLUR_WIDTH, PHOTO_PIPELINE_VERSION, photoFileBase, photoFiles, WIDTHS } from './files.mjs';
import { APP_ROOT, fetchWithTimeout, MANIFEST_FILE, readJson } from './lib.mjs';

const OUT_DIR = path.join(APP_ROOT, 'apps', 'web', 'public', 'dish-photos');
const CACHE = path.join(APP_ROOT, '.cache', 'dish-photos');
const SOURCES = path.join(CACHE, 'src');
const ENCODED = path.join(CACHE, 'out');
const STAMP = path.join(OUT_DIR, '.stamp');
// AVIF effort ≤ 4: effort 5+ doubles the encoding time for ≈ 2 % smaller files (a Render build has one slow core).
const AVIF = { quality: 52, effort: 4 };
const WEBP = { quality: 72, effort: 4 };
const BLUR = { sigma: 2.4, quality: 70 };
const CONCURRENCY = 2;
/** Share of photos that may be missing before a production build fails. */
export const MISSING_LIMIT = 0.05;

/** Every photo of the manifest once (a fallback is a photo of its own). */
export function photosOf(manifest) {
  const seen = new Map();
  for (const set of Object.values(manifest.photos ?? {})) {
    for (const photo of [set.primary, set.fallback]) {
      if (photo) seen.set(photoFileBase(photo), photo);
    }
  }
  return [...seen.values()];
}

/** The run is skipped when this matches the stamp: the photos, their crops and the pipeline. */
export function manifestHash(photos) {
  const keys = photos.map(photoFileBase).sort();
  return createHash('sha1')
    .update(`${PHOTO_PIPELINE_VERSION}\n${keys.join('\n')}`)
    .digest('hex');
}

/** The CDN copy to crop from: wide enough for a 960 px wide 3:4 crop of a landscape photo. */
export function downloadUrl(photo) {
  const url = new URL(photo.src);
  if (photo.provider === 'pexels') {
    url.search = new URLSearchParams({ auto: 'compress', cs: 'tinysrgb', w: '1920' }).toString();
  } else {
    // Unsplash (imgix): keep ixid, ask for a plain JPEG.
    url.searchParams.set('w', '1920');
    url.searchParams.set('fm', 'jpg');
    url.searchParams.set('q', '85');
  }
  return url.toString();
}

export const tooManyMissing = (missing, total) => total > 0 && missing / total > MISSING_LIMIT;

async function download(photo, timeoutMs, attempts) {
  const file = path.join(SOURCES, `${photo.provider}-${photo.id}.jpg`);
  if (existsSync(file)) return readFile(file);
  let error = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(downloadUrl(photo), {}, timeoutMs);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      await mkdir(SOURCES, { recursive: true });
      await writeFile(file, buffer);
      return buffer;
    } catch (caught) {
      error = caught;
    }
  }
  throw error ?? new Error('download failed');
}

// libvips (sharp) may mishandle non-ASCII paths on Windows (the project lives in a Cyrillic folder):
// Node's fs does all disk I/O, sharp only sees buffers (3afe286).
async function encode(photo, buffer) {
  // Decoded once, upright (EXIF orientation applied), then cropped from the raw pixels: no second lossy JPEG pass.
  const { data, info } = await sharp(buffer).rotate().raw().toBuffer({ resolveWithObject: true });
  const box = cropBox(info.width, info.height, photo.focal);
  const base = photoFileBase(photo);
  const cropped = sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  }).extract(box);
  await mkdir(ENCODED, { recursive: true });
  for (const width of WIDTHS) {
    const pipeline = cropped.clone().resize(width, Math.round((width * 4) / 3));
    await writeFile(
      path.join(ENCODED, `${base}-${width}.avif`),
      await pipeline.clone().avif(AVIF).toBuffer(),
    );
    await writeFile(
      path.join(ENCODED, `${base}-${width}.webp`),
      await pipeline.clone().webp(WEBP).toBuffer(),
    );
  }
  await writeFile(
    path.join(ENCODED, `${base}-blur.webp`),
    await cropped
      .clone()
      .resize(BLUR_WIDTH, Math.round((BLUR_WIDTH * 4) / 3))
      .blur(BLUR.sigma)
      .webp({ quality: BLUR.quality })
      .toBuffer(),
  );
}

/** Runs `task` over `items`, `limit` at a time. */
async function pool(items, limit, task) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function materialize({ quick }) {
  const started = Date.now();
  const manifest = await readJson(MANIFEST_FILE, { photos: {} });
  const photos = photosOf(manifest);
  const hash = manifestHash(photos);
  const wanted = new Set(photos.flatMap(photoFiles));
  await mkdir(OUT_DIR, { recursive: true });

  const present = new Set(await readdir(OUT_DIR));
  const stamp = existsSync(STAMP) ? (await readFile(STAMP, 'utf8')).trim() : null;
  if (stamp === hash && [...wanted].every((name) => present.has(name))) {
    return { total: photos.length, missing: 0, skipped: true, ms: Date.now() - started };
  }

  const timeoutMs = quick ? 4000 : 30_000;
  const attempts = quick ? 1 : 3;
  let unreachable = false;
  const failed = new Set();
  await pool(photos, CONCURRENCY, async (photo) => {
    const files = photoFiles(photo);
    const encoded = () => files.every((name) => existsSync(path.join(ENCODED, name)));
    try {
      if (!encoded()) {
        if (unreachable) throw new Error('CDN unreachable');
        await encode(photo, await download(photo, timeoutMs, attempts));
      }
      for (const name of files) {
        if (!present.has(name)) await copyFile(path.join(ENCODED, name), path.join(OUT_DIR, name));
      }
    } catch {
      failed.add(photoFileBase(photo));
      // The first failure in quick mode means the CDN is out of reach from here: don't wait on every photo.
      if (quick) unreachable = true;
    }
  });

  // Files of photos that are no longer in the manifest (and the stage-2 index).
  for (const name of await readdir(OUT_DIR)) {
    if (name !== '.stamp' && !wanted.has(name)) await rm(path.join(OUT_DIR, name), { force: true });
  }
  if (failed.size === 0) await writeFile(STAMP, `${hash}\n`);
  else await rm(STAMP, { force: true });
  return { total: photos.length, missing: failed.size, skipped: false, ms: Date.now() - started };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const quick = process.argv.includes('--quick');
  try {
    const { total, missing, skipped, ms } = await materialize({ quick });
    const seconds = (ms / 1000).toFixed(1);
    if (skipped) console.log(`Фото блюд: ${total} — без изменений (${seconds} с).`);
    else
      console.log(
        `Фото блюд: ${total - missing} из ${total} на нашем сайте за ${seconds} с` +
          (missing ? `; не получилось: ${missing}` : '') +
          '.',
      );
    if (!quick && tooManyMissing(missing, total)) {
      console.error(
        `Фото блюд: не хватает ${missing} из ${total} (больше ${MISSING_LIMIT * 100} %) — сборка остановлена. ` +
          'Проверьте доступ к images.unsplash.com и запустите сборку ещё раз.',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Фото блюд: ошибка (${error instanceof Error ? error.message : 'неизвестно'}).`);
    if (!quick) process.exitCode = 1;
  }
}
