import type { DishPhoto, PhotoManifest } from '@refectorio/taste-core';
import manifestJson from '@refectorio/taste-core/data/photo-manifest.json';
import { decode } from 'blurhash';

/**
 * The runtime photo chain of a dish card (ТЗ §9.6): primary (an Unsplash hotlink, or a self-hosted Pexels file when
 * one was materialized) → the curated Unsplash fallback → a generated placeholder (blurhash or average colour + the
 * dish name). A source that fails or is late (TINDER.photoTimeoutMs) moves down the chain: never a broken image.
 * The manifest is validated by the taste-core tests; here it is only typed.
 */
const manifest = manifestJson as unknown as PhotoManifest;

/** Card widths of the image set (srcset 480w/720w/960w, same as scripts/photos/crop.mjs). */
export const PHOTO_WIDTHS = [480, 720, 960] as const;
/** The card's aspect (448 × 583 in the mockup). */
export const CARD_ASPECT = 583 / 448;
/** `sizes`: phones — the card is ≈ 88vw; the desktop frame — 448 of 1920 mockup px. */
export const PHOTO_SIZES = '(max-width: 47.99rem) 88vw, 24vw';

export type PhotoSource = {
  readonly key: string;
  readonly provider: DishPhoto['provider'];
  readonly src: string;
  readonly srcSet: string;
  /** A self-hosted AVIF set (`<source type="image/avif">`). */
  readonly avifSrcSet?: string;
  readonly author: string;
  readonly authorUrl: string;
  /** The provider's site with the referral parameters its guidelines ask for. */
  readonly providerUrl: string;
};

export type DishPhotos = {
  readonly sources: readonly PhotoSource[];
  /** For the placeholder and the soft gradient under the dish name. */
  readonly blurhash: string | null;
  readonly avgColor: string | null;
  readonly alt: string | null;
};

const UNSPLASH_HOME = 'https://unsplash.com/?utm_source=refectorio&utm_medium=referral';
const PEXELS_HOME = 'https://www.pexels.com';

/** Self-hosted Pexels files: which dishes were materialized (public/dish-photos/index.json, fetched once). */
type LocalIndex = {
  readonly widths: readonly number[];
  readonly files: Readonly<Record<string, string>>;
};
let localIndex: LocalIndex | null = null;
let localIndexRequested = false;
export function loadLocalPhotoIndex(): void {
  if (localIndexRequested) return;
  localIndexRequested = true;
  const hasPexels = Object.values(manifest.photos).some((set) => set.primary.provider === 'pexels');
  if (!hasPexels) return;
  void fetch(`${import.meta.env.BASE_URL}dish-photos/index.json`)
    .then((response) => (response.ok ? (response.json() as Promise<LocalIndex>) : null))
    .then((index) => {
      localIndex = index;
    })
    .catch(() => {
      localIndex = null;
    });
}

function unsplashSource(photo: DishPhoto): PhotoSource {
  const sized = (width: number) => {
    const url = new URL(photo.src);
    url.searchParams.set('w', String(width));
    url.searchParams.set('h', String(Math.round(width * CARD_ASPECT)));
    url.searchParams.set('fit', 'crop');
    url.searchParams.set('crop', 'focalpoint');
    url.searchParams.set('fp-x', photo.focal.x.toFixed(3));
    url.searchParams.set('fp-y', photo.focal.y.toFixed(3));
    url.searchParams.set('auto', 'format');
    url.searchParams.set('q', '70');
    return url.toString();
  };
  return {
    key: `unsplash:${photo.id}`,
    provider: 'unsplash',
    src: sized(720),
    srcSet: PHOTO_WIDTHS.map((w) => `${sized(w)} ${w}w`).join(', '),
    author: photo.author,
    authorUrl: photo.authorUrl,
    providerUrl: UNSPLASH_HOME,
  };
}

function localSource(dishId: string, photo: DishPhoto): PhotoSource | null {
  const hash = localIndex?.files[dishId];
  if (!hash) return null;
  const file = (width: number, ext: 'avif' | 'webp') =>
    `${import.meta.env.BASE_URL}dish-photos/${dishId}-${hash}-${width}.${ext}`;
  return {
    key: `pexels:${photo.id}`,
    provider: 'pexels',
    src: file(720, 'webp'),
    srcSet: PHOTO_WIDTHS.map((w) => `${file(w, 'webp')} ${w}w`).join(', '),
    avifSrcSet: PHOTO_WIDTHS.map((w) => `${file(w, 'avif')} ${w}w`).join(', '),
    author: photo.author,
    authorUrl: photo.authorUrl,
    providerUrl: PEXELS_HOME,
  };
}

/** The chain of a dish (empty: placeholder only). */
export function photosFor(dishId: string): DishPhotos {
  const set = manifest.photos[dishId];
  if (!set) return { sources: [], blurhash: null, avgColor: null, alt: null };
  const sources: PhotoSource[] = [];
  for (const photo of [set.primary, set.fallback]) {
    if (!photo) continue;
    const source =
      photo.provider === 'unsplash' ? unsplashSource(photo) : localSource(dishId, photo);
    if (source && (source.provider !== 'unsplash' || unsplashHealthy())) sources.push(source);
  }
  return {
    sources,
    blurhash: set.primary.blurhash,
    avgColor: set.primary.avgColor,
    alt: set.primary.altRu,
  };
}

/**
 * Provider health (ТЗ §9.6, D-037): images.unsplash.com may be slow or blocked for some networks. After two late or
 * failed photos in a row the game stops waiting for it and shows placeholders at once (until the page reloads).
 */
let unsplashFailures = 0;
const UNSPLASH_GIVE_UP_AFTER = 2;
export const unsplashHealthy = () => unsplashFailures < UNSPLASH_GIVE_UP_AFTER;
export function reportPhoto(source: PhotoSource, ok: boolean): void {
  if (source.provider !== 'unsplash') return;
  unsplashFailures = ok ? 0 : unsplashFailures + 1;
}

/** Lookahead (ТЗ §9.1): the next cards' photos are fetched and decoded while this one is shown. */
const preloaded = new Set<string>();
export function preloadPhoto(dishId: string): void {
  const first = photosFor(dishId).sources[0];
  if (!first || preloaded.has(first.key)) return;
  preloaded.add(first.key);
  const image = new Image();
  image.decoding = 'async';
  image.sizes = PHOTO_SIZES;
  image.srcset = first.avifSrcSet ?? first.srcSet;
  image.src = first.src;
  void image.decode().catch(() => {
    preloaded.delete(first.key);
  });
}

/** Blurhash → a tiny canvas (32 × 42 px), stretched by CSS: the placeholder and the soft gradient under the name. */
const BLUR_W = 32;
const BLUR_H = Math.round(BLUR_W * CARD_ASPECT);
const decoded = new Map<string, { readonly data: ImageData; readonly topLuminance: number }>();

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function decodeBlurhash(
  hash: string,
): { readonly data: ImageData; readonly topLuminance: number } | null {
  const cached = decoded.get(hash);
  if (cached) return cached;
  try {
    const pixels = decode(hash, BLUR_W, BLUR_H);
    const data = new ImageData(new Uint8ClampedArray(pixels), BLUR_W, BLUR_H);
    // The top third carries the white dish name: its brightest row decides how much tint it needs.
    let top = 0;
    const rows = Math.round(BLUR_H / 3);
    for (let y = 0; y < rows; y += 1) {
      let row = 0;
      for (let x = 0; x < BLUR_W; x += 1) {
        const i = (y * BLUR_W + x) * 4;
        row +=
          0.2126 * linear(pixels[i] ?? 0) +
          0.7152 * linear(pixels[i + 1] ?? 0) +
          0.0722 * linear(pixels[i + 2] ?? 0);
      }
      top = Math.max(top, row / BLUR_W);
    }
    const result = { data, topLuminance: top };
    decoded.set(hash, result);
    return result;
  } catch {
    return null;
  }
}

/** White text needs a background luminance ≤ 0.183 for 4.5:1; the tint darkens the blurred top until it gets there. */
const WHITE_TEXT_MAX_LUMINANCE = 0.183;
export function tintFor(topLuminance: number, minimum: number): number {
  if (topLuminance <= 0) return minimum;
  const needed = 1 - (WHITE_TEXT_MAX_LUMINANCE * 0.9) / topLuminance;
  return Math.min(0.85, Math.max(minimum, needed));
}

export function hexLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export const BLURHASH_SIZE = { width: BLUR_W, height: BLUR_H } as const;
