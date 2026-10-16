// Shared helpers of the dish photo pipeline (ТЗ §9.8). Keys are read here and only here: environment variables first,
// then the project's .secrets/ folder outside the repository. They are never printed, logged or written anywhere.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT_ROOT = path.resolve(APP_ROOT, '..');
export const DATA_DIR = path.join(APP_ROOT, 'packages', 'taste-core', 'data');
export const CACHE_DIR = path.join(APP_ROOT, '.cache', 'photos');
export const MANIFEST_FILE = path.join(DATA_DIR, 'photo-manifest.json');
/** The site's copy of the manifest: only the fields the browser reads (runtime.mjs). */
export const RUNTIME_MANIFEST_FILE = path.join(DATA_DIR, 'photo-runtime.json');
export const OVERRIDES_FILE = path.join(DATA_DIR, 'photo-overrides.json');
export const CANDIDATES_FILE = path.join(CACHE_DIR, 'candidates.json');
export const PICKS_FILE = path.join(CACHE_DIR, 'picks.json');

/** The Unsplash app is named «Refectorio» (КЛЮЧИ ДЛЯ ФОТО.md): attribution links carry this utm_source. */
export const UTM = 'utm_source=refectorio&utm_medium=referral';

const KEYS = {
  pexels: { env: 'PEXELS_API_KEY', file: 'pexels-api-key.txt' },
  unsplash: { env: 'UNSPLASH_ACCESS_KEY', file: 'unsplash-access-key.txt' },
};

/** The key or null. Never print the result. */
export async function readKey(provider) {
  const spec = KEYS[provider];
  const fromEnv = process.env[spec.env]?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(PROJECT_ROOT, '.secrets', spec.file);
  if (!existsSync(file)) return null;
  const value = (await readFile(file, 'utf8')).trim();
  return value.length > 0 ? value : null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function loadCatalog() {
  const catalog = await readJson(path.join(DATA_DIR, 'catalog.json'), null);
  if (!catalog) throw new Error('packages/taste-core/data/catalog.json is missing');
  const queries = await readJson(path.join(DATA_DIR, 'photo-queries.json'), {});
  return { catalog, queries };
}

/** Polite pacing: at most one API request per second, and waiting out the rate limit when it runs low. */
export function createPacer({ minIntervalMs = 1100 } = {}) {
  let last = 0;
  return {
    async wait() {
      const now = Date.now();
      const delay = last + minIntervalMs - now;
      if (delay > 0) await sleep(delay);
      last = Date.now();
    },
  };
}

/** Rate-limit headers (both providers use X-Ratelimit-*); Pexels' reset is a UNIX time, Unsplash resets hourly. */
export function rateLimit(response) {
  const remaining = Number(response.headers.get('x-ratelimit-remaining'));
  const limit = Number(response.headers.get('x-ratelimit-limit'));
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    limit: Number.isFinite(limit) ? limit : null,
    resetAt: Number.isFinite(reset) && reset > 0 ? reset * 1000 : null,
  };
}

/** Milliseconds until the next full hour (Unsplash demo quota window) plus a small margin. */
export function untilNextHourMs(now = Date.now()) {
  const next = new Date(now);
  next.setMinutes(60, 30, 0);
  return next.getTime() - now;
}

// ── Providers ─────────────────────────────────────────────────────────────────────────────────

/** Normalised search result of either provider. */
function fromPexels(photo) {
  return {
    provider: 'pexels',
    id: String(photo.id),
    width: photo.width,
    height: photo.height,
    pageUrl: photo.url,
    author: photo.photographer,
    authorUrl: photo.photographer_url,
    avgColor: photo.avg_color ?? null,
    alt: photo.alt ?? '',
    // The original on the CDN; size parameters are added where it is used.
    src: photo.src?.original ?? null,
    thumb: photo.src?.medium ?? null,
    likes: null,
    blurhash: null,
    downloadLocation: null,
  };
}

function fromUnsplash(photo) {
  return {
    provider: 'unsplash',
    id: photo.id,
    width: photo.width,
    height: photo.height,
    pageUrl: photo.links?.html ?? null,
    author: photo.user?.name ?? '',
    authorUrl: photo.user?.links?.html ?? null,
    avgColor: photo.color ?? null,
    alt: [photo.alt_description, photo.description].filter(Boolean).join(' · '),
    // Hotlink only (API guidelines): the raw URL keeps its ixid parameter.
    src: photo.urls?.raw ?? null,
    thumb: photo.urls?.small ?? null,
    likes: photo.likes ?? 0,
    blurhash: photo.blur_hash ?? null,
    downloadLocation: photo.links?.download_location ?? null,
  };
}

export async function searchPexels(key, query, pacer) {
  await pacer.wait();
  const url = new URL('https://api.pexels.com/v1/search');
  url.search = new URLSearchParams({ query, orientation: 'portrait', per_page: '40' }).toString();
  const response = await fetchWithTimeout(url, { headers: { Authorization: key } });
  const limit = rateLimit(response);
  if (response.status === 429) return { photos: [], limit, throttled: true };
  if (!response.ok) throw new Error(`Pexels search failed: HTTP ${response.status}`);
  const body = await response.json();
  return { photos: (body.photos ?? []).map(fromPexels), limit, throttled: false };
}

export async function searchUnsplash(key, query, pacer) {
  await pacer.wait();
  const url = new URL('https://api.unsplash.com/search/photos');
  url.search = new URLSearchParams({
    query,
    orientation: 'portrait',
    per_page: '30',
    content_filter: 'high',
  }).toString();
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
  });
  const limit = rateLimit(response);
  if (response.status === 403 || response.status === 429)
    return { photos: [], limit, throttled: true };
  if (!response.ok) throw new Error(`Unsplash search failed: HTTP ${response.status}`);
  const body = await response.json();
  return { photos: (body.results ?? []).map(fromUnsplash), limit, throttled: false };
}

/**
 * Unsplash requires this call once a photo is chosen for use (API guidelines, «Triggering a download»). It counts
 * against the demo quota (50 an hour): when the quota runs out, wait for the next hour instead of losing the call.
 */
export async function trackUnsplashDownload(key, downloadLocation, pacer) {
  // The key goes to the Unsplash API only, whatever a cached candidate says.
  if (new URL(downloadLocation).host !== 'api.unsplash.com') return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await pacer.wait();
    const response = await fetchWithTimeout(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
    });
    const { remaining } = rateLimit(response);
    if (response.ok) {
      if (remaining !== null && remaining <= 1) {
        console.log(
          `unsplash: лимит запросов — пауза ${Math.ceil(untilNextHourMs() / 60_000)} мин`,
        );
        await sleep(untilNextHourMs());
      }
      return true;
    }
    if (response.status !== 403 && response.status !== 429) return false;
    console.log(`unsplash: лимит запросов — пауза ${Math.ceil(untilNextHourMs() / 60_000)} мин`);
    await sleep(untilNextHourMs());
  }
  return false;
}

/** Image URLs at a given width (no API cost: CDN requests are not counted by either provider). */
export function sizedUrl(photo, width) {
  if (photo.provider === 'pexels') {
    const url = new URL(photo.src);
    url.search = new URLSearchParams({
      auto: 'compress',
      cs: 'tinysrgb',
      w: String(width),
    }).toString();
    return url.toString();
  }
  const url = new URL(photo.src);
  url.searchParams.set('w', String(width));
  url.searchParams.set('auto', 'format');
  url.searchParams.set('q', '75');
  return url.toString();
}

/** A short, safe log label (never contains a key). */
export const label = (dishId, photo) => `${dishId} ← ${photo.provider}:${photo.id}`;
