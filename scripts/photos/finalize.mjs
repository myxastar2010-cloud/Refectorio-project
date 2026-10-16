// Turns the visual choice into the committed manifest (ТЗ §9.8 steps 3–4):
//   .cache/photos/picks.json  { "<dishId>": { "provider": "pexels", "id": "123", "fallback"?: { "provider": "unsplash", "id": "abc" } } }
//   packages/taste-core/data/photo-overrides.json (the team pins photos the same way; it wins over picks)
// → packages/taste-core/data/photo-manifest.json (metadata only — photo files never go into git: Pexels licence), the
//   site's copy photo-runtime.json (runtime.mjs) and docs/photo-credits.md. Fires Unsplash's download_location once per chosen photo.
//   node scripts/photos/finalize.mjs [--skip-tracking]
// --skip-tracking writes the manifest at once (no API calls); a later run without it fires the pending downloads.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encode } from 'blurhash';
import sharp from 'sharp';
import {
  APP_ROOT,
  CANDIDATES_FILE,
  createPacer,
  fetchWithTimeout,
  loadCatalog,
  MANIFEST_FILE,
  OVERRIDES_FILE,
  PICKS_FILE,
  readJson,
  readKey,
  sizedUrl,
  trackUnsplashDownload,
  UTM,
  writeJson,
} from './lib.mjs';
import { writeRuntimeManifest } from './runtime.mjs';

const skipTracking = process.argv.includes('--skip-tracking');
const { catalog } = await loadCatalog();
const candidates = await readJson(CANDIDATES_FILE, { dishes: {} });
const picks = { ...(await readJson(PICKS_FILE, {})), ...(await readJson(OVERRIDES_FILE, {})) };
const previous = await readJson(MANIFEST_FILE, { photos: {} });
const unsplashKey = await readKey('unsplash');
const pexelsKey = await readKey('pexels');
const pacer = createPacer();

async function details(dishId, choice) {
  const fromCandidates = candidates.dishes[dishId]?.candidates?.find(
    (c) => c.provider === choice.provider && c.id === choice.id,
  );
  if (fromCandidates) return fromCandidates;
  // A pinned photo that curate never saw: ask the API (needs that provider's key).
  if (choice.provider === 'pexels' && pexelsKey) {
    await pacer.wait();
    const response = await fetchWithTimeout(`https://api.pexels.com/v1/photos/${choice.id}`, {
      headers: { Authorization: pexelsKey },
    });
    if (response.ok) {
      const p = await response.json();
      return {
        provider: 'pexels',
        id: String(p.id),
        width: p.width,
        height: p.height,
        pageUrl: p.url,
        author: p.photographer,
        authorUrl: p.photographer_url,
        avgColor: p.avg_color,
        src: p.src.original,
        blurhash: null,
        downloadLocation: null,
      };
    }
  }
  if (choice.provider === 'unsplash' && unsplashKey) {
    await pacer.wait();
    const response = await fetchWithTimeout(`https://api.unsplash.com/photos/${choice.id}`, {
      headers: { Authorization: `Client-ID ${unsplashKey}`, 'Accept-Version': 'v1' },
    });
    if (response.ok) {
      const p = await response.json();
      return {
        provider: 'unsplash',
        id: p.id,
        width: p.width,
        height: p.height,
        pageUrl: p.links.html,
        author: p.user.name,
        authorUrl: p.user.links.html,
        avgColor: p.color,
        src: p.urls.raw,
        blurhash: p.blur_hash,
        downloadLocation: p.links.download_location,
      };
    }
  }
  return null;
}

/** Blurhash, average colour and the 3:4 focal point from a small copy of the photo (CDN, no API cost). */
async function analyse(photo) {
  const response = await fetchWithTimeout(sizedUrl(photo, 600), {}, 30_000);
  if (!response.ok) throw new Error(`image ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const meta = await sharp(buffer).metadata();
  const cropW = Math.min(meta.width, Math.round((meta.height * 3) / 4));
  const cropH = Math.min(meta.height, Math.round((cropW * 4) / 3));
  const { info } = await sharp(buffer)
    .resize(cropW, cropH, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true });
  const offsetX = -(info.cropOffsetLeft ?? 0);
  const offsetY = -(info.cropOffsetTop ?? 0);
  const focal = {
    x: Math.round(((offsetX + cropW / 2) / meta.width) * 1000) / 1000,
    y: Math.round(((offsetY + cropH / 2) / meta.height) * 1000) / 1000,
  };
  const { data, info: small } = await sharp(buffer)
    .resize(32, 43, { fit: 'cover', position: sharp.strategy.attention })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash =
    photo.blurhash ?? encode(new Uint8ClampedArray(data), small.width, small.height, 4, 5);
  const { dominant } = await sharp(buffer).stats();
  const hex = (n) => n.toString(16).padStart(2, '0');
  const avgColor = photo.avgColor ?? `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`;
  return { focal, blurhash, avgColor };
}

const withUtm = (url) => (url ? `${url}${url.includes('?') ? '&' : '?'}${UTM}` : url);

async function entry(dish, choice, today) {
  const photo = await details(dish.id, choice);
  if (!photo) return null;
  const known = [previous.photos[dish.id]?.primary, previous.photos[dish.id]?.fallback].find(
    (p) => p?.provider === photo.provider && p?.id === photo.id,
  );
  const analysis = known
    ? { focal: known.focal, blurhash: known.blurhash, avgColor: known.avgColor }
    : await analyse(photo);
  let downloadTrackedAt = known?.downloadTrackedAt ?? null;
  if (
    photo.provider === 'unsplash' &&
    !downloadTrackedAt &&
    photo.downloadLocation &&
    unsplashKey &&
    !skipTracking
  ) {
    if (await trackUnsplashDownload(unsplashKey, photo.downloadLocation, pacer))
      downloadTrackedAt = today;
  }
  return {
    provider: photo.provider,
    id: photo.id,
    pageUrl: photo.provider === 'unsplash' ? withUtm(photo.pageUrl) : photo.pageUrl,
    author: photo.author,
    authorUrl: photo.provider === 'unsplash' ? withUtm(photo.authorUrl) : photo.authorUrl,
    src: photo.src,
    width: photo.width,
    height: photo.height,
    focal: analysis.focal,
    avgColor: analysis.avgColor,
    blurhash: analysis.blurhash,
    altRu: dish.altRu,
    chosenAt: known?.chosenAt ?? today,
    ...(photo.provider === 'unsplash' ? { downloadTrackedAt } : {}),
  };
}

const today = new Date().toISOString().slice(0, 10);
const photos = {};
for (const dish of catalog.dishes) {
  const choice = picks[dish.id];
  if (!choice) continue;
  try {
    const primary = await entry(dish, choice, today);
    if (!primary) continue;
    const fallback = choice.fallback ? await entry(dish, choice.fallback, today) : null;
    photos[dish.id] = fallback ? { primary, fallback } : { primary };
    console.log(`${dish.id}: ${primary.provider}${fallback ? ` + ${fallback.provider}` : ''}`);
  } catch (error) {
    console.log(`${dish.id}: пропущено (${error instanceof Error ? error.message : 'ошибка'})`);
  }
}

await writeJson(MANIFEST_FILE, {
  version: 1,
  catalogVersion: catalog.version,
  updatedAt: today,
  photos,
});
await writeRuntimeManifest();

// Public credits page (both providers require crediting the photographer).
const used = new Set(
  Object.values(photos).flatMap((set) =>
    [set.primary, set.fallback].filter(Boolean).map((p) => p.provider),
  ),
);
const servicesText = () => {
  const links = [
    used.has('pexels') ? '[Pexels](https://www.pexels.com)' : null,
    used.has('unsplash') ? `[Unsplash](https://unsplash.com/?${UTM})` : null,
  ].filter(Boolean);
  return links.length > 1 ? `с сервисов ${links.join(' и ')}` : `с сервиса ${links[0] ?? '—'}`;
};
const rows = catalog.dishes.flatMap((dish) => {
  const set = photos[dish.id];
  if (!set) return [];
  return [set.primary, set.fallback]
    .filter(Boolean)
    .map(
      (p) =>
        `| ${dish.nameRu} | [${p.author}](${p.authorUrl}) | [${p.provider === 'pexels' ? 'Pexels' : 'Unsplash'}](${p.pageUrl}) |`,
    );
});
await writeFile(
  path.join(APP_ROOT, 'docs', 'photo-credits.md'),
  [
    '# Фото блюд — авторы',
    '',
    `Фотографии в игре «Выберите блюдо» — ${servicesText()}. Спасибо фотографам!`,
    'Правила использования — [photo-licensing.md](photo-licensing.md).',
    'Файл создаётся скриптом `scripts/photos/finalize.mjs`.',
    '',
    `Всего фото: ${rows.length} (обновлено ${today}).`,
    '',
    '| Блюдо | Автор | Источник |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n'),
);
console.log(`Манифест: ${Object.keys(photos).length} блюд с фото из ${catalog.dishes.length}.`);
