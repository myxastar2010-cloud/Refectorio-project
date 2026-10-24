import type { DishPhotoRuntime, PhotoRuntimeManifest } from '@refectorio/taste-core';
import { photoFileBase } from '@refectorio/taste-core';
import runtimeJson from '@refectorio/taste-core/data/photo-runtime.json';
import { decode } from 'blurhash';

/**
 * The runtime photo chain of a dish card (ADR 0011): the photo from our own origin (built from the manifest by
 * scripts/photos/materialize.mjs) → a generated placeholder (blurhash or average colour + the dish name). A source that
 * fails or is late (TINDER.photoTimeoutMs) moves down the chain: never a broken image. The build flag
 * PHOTO_HOSTING=unsplash switches back to hotlinking images.unsplash.com with a credit line (vite.config.ts).
 * The data is the site's copy of the manifest (taste-core/data/photo-runtime.json, checked against the validated
 * manifest by the scripts' tests): a chunk of its own — loadQuiz also imports it, which keeps it out of the quiz chunk
 * and fetches both in parallel.
 */
const manifest = runtimeJson as unknown as PhotoRuntimeManifest;

/** Hotlinks with a credit line instead of our own copies (build flag, D-048). */
export const HOTLINKED = __PHOTO_HOSTING__ === 'unsplash';

/** Card widths of the image set (srcset 480w/720w/960w, same as scripts/photos/files.mjs). */
export const PHOTO_WIDTHS = [480, 720, 960] as const;
/** The card's aspect (448 × 583 in the mockup). */
export const CARD_ASPECT = 583 / 448;
/** `sizes`: phones — the card is ≈ 88vw; the desktop frame — 448 of 1920 mockup px. */
export const PHOTO_SIZES = '(max-width: 47.99rem) 88vw, 24vw';

export type PhotoSource = {
  readonly key: string;
  readonly src: string;
  readonly srcSet: string;
  /** A self-hosted AVIF set (`<source type="image/avif">`). */
  readonly avifSrcSet?: string;
  /** Hotlink mode only: the credit line under the card. */
  readonly credit?: { readonly author: string; readonly authorUrl: string };
};

export type DishPhotos = {
  readonly sources: readonly PhotoSource[];
  /** For the placeholder and the soft gradient under the dish name. */
  readonly blurhash: string | null;
  readonly avgColor: string | null;
  /** The small pre-blurred copy behind the dish info (self-hosted only). */
  readonly blurred: string | null;
};

const fileUrl = (photo: DishPhotoRuntime, suffix: string) =>
  `${import.meta.env.BASE_URL}dish-photos/${photoFileBase(photo)}-${suffix}`;

function selfSource(photo: DishPhotoRuntime): PhotoSource {
  return {
    key: `${photo.provider}:${photo.id}`,
    src: fileUrl(photo, '720.webp'),
    srcSet: PHOTO_WIDTHS.map((w) => `${fileUrl(photo, `${w}.webp`)} ${w}w`).join(', '),
    avifSrcSet: PHOTO_WIDTHS.map((w) => `${fileUrl(photo, `${w}.avif`)} ${w}w`).join(', '),
  };
}

function hotlinkSource(photo: DishPhotoRuntime): PhotoSource | null {
  if (photo.provider !== 'unsplash' || !photo.src) return null;
  const raw = photo.src;
  const sized = (width: number) => {
    const url = new URL(raw);
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
  const source = {
    key: `hotlink:${photo.id}`,
    src: sized(720),
    srcSet: PHOTO_WIDTHS.map((w) => `${sized(w)} ${w}w`).join(', '),
  };
  return photo.author && photo.authorUrl
    ? { ...source, credit: { author: photo.author, authorUrl: photo.authorUrl } }
    : source;
}

/** A curated photo exists (the game offers only these dishes). */
export const hasPhoto = (dishId: string): boolean => dishId in manifest.photos;

/** The chain of a dish (empty: placeholder only). */
export function photosFor(dishId: string): DishPhotos {
  const set = manifest.photos[dishId];
  if (!set) return { sources: [], blurhash: null, avgColor: null, blurred: null };
  const sources: PhotoSource[] = [];
  for (const photo of [set.primary, set.fallback]) {
    if (!photo) continue;
    const source = HOTLINKED ? (hotlinkHealthy() ? hotlinkSource(photo) : null) : selfSource(photo);
    if (source) sources.push(source);
  }
  return {
    sources,
    blurhash: set.primary.blurhash,
    avgColor: set.primary.avgColor,
    blurred: HOTLINKED ? null : fileUrl(set.primary, 'blur.webp'),
  };
}

/**
 * Hotlink health (D-037): images.unsplash.com may be slow or blocked for some networks. After two late or failed
 * photos in a row the game stops waiting for it and shows placeholders at once (until the page reloads). Our own
 * files are never given up on: a missing one simply falls back to its placeholder.
 */
let hotlinkFailures = 0;
const HOTLINK_GIVE_UP_AFTER = 2;
const hotlinkHealthy = () => hotlinkFailures < HOTLINK_GIVE_UP_AFTER;
export function reportPhoto(ok: boolean): void {
  if (!HOTLINKED) return;
  hotlinkFailures = ok ? 0 : hotlinkFailures + 1;
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

/** Where the open card's text lies (shares of the card): below the name, above the chevron. */
export const INFO_BOX = { x0: 0.08, x1: 0.92, y0: 0.12, y1: 0.92 } as const;

/**
 * The 95th-percentile luminance under the info text of a blurred picture (RGBA pixels): the shade over it is chosen so
 * that even the lightest spots keep white text ≥ 4.5:1 (§5.4).
 */
export function infoLuminance(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  share = 0.95,
): number {
  const values: number[] = [];
  for (let y = Math.floor(height * INFO_BOX.y0); y < Math.ceil(height * INFO_BOX.y1); y += 1) {
    for (let x = Math.floor(width * INFO_BOX.x0); x < Math.ceil(width * INFO_BOX.x1); x += 1) {
      const i = (y * width + x) * 4;
      values.push(
        0.2126 * linear(pixels[i] ?? 0) +
          0.7152 * linear(pixels[i + 1] ?? 0) +
          0.0722 * linear(pixels[i + 2] ?? 0),
      );
    }
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(share * (values.length - 1))] ?? 0;
}

/** The same for a loaded (same-origin) image: drawn once at its own small size. */
export function imageInfoLuminance(image: HTMLImageElement): number | null {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (width === 0 || height === 0) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return infoLuminance(context.getImageData(0, 0, width, height).data, width, height);
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
