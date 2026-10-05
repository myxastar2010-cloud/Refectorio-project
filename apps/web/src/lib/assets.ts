import manifest from '../assets/generated/manifest.json';
import type { ImageKey } from '../content/schema';

/** Hashed URLs of every generated image (Vite fingerprints them for long-term caching). */
const urls = import.meta.glob<string>('../assets/generated/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function url(file: string): string {
  const found = urls[`../assets/generated/${file}`];
  if (!found) throw new Error(`Generated image is missing: ${file} — run "npm run assets"`);
  return found;
}

export type ResponsiveImage = {
  readonly avifSrcSet: string;
  readonly webpSrcSet: string;
  readonly fallback: string;
};

export type FoodSprite = {
  readonly id: number;
  readonly slug: string;
  /** Visible (opaque) part of the square sprite as fractions of its edge. */
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** 32 rows of 32 bits, bit 31 = leftmost pixel (alpha ≥ 50%). */
  readonly mask: Uint32Array;
  readonly sharp: ResponsiveImage;
  readonly blurred: ResponsiveImage;
  /** Transparent padding of the blurred copy on each side, as a share of the sprite edge. */
  readonly blurPadRatio: number;
};

type Variants = { readonly avif: string; readonly webp: string };

function responsive(
  oneX: Variants,
  twoX: Variants,
  widths: readonly [number, number],
): ResponsiveImage {
  return {
    avifSrcSet: `${url(oneX.avif)} ${widths[0]}w, ${url(twoX.avif)} ${widths[1]}w`,
    webpSrcSet: `${url(oneX.webp)} ${widths[0]}w, ${url(twoX.webp)} ${widths[1]}w`,
    fallback: url(oneX.webp),
  };
}

export const FOOD_SPRITE_SIZE_1X = manifest.food.size1x;
export const FOOD_MASK_SIZE = manifest.food.maskSize;

export const foodSprites: readonly FoodSprite[] = manifest.food.items.map((item) => {
  const pad = item.blurred.padRatio;
  const blurredWidth = (density: number) =>
    Math.round(FOOD_SPRITE_SIZE_1X * density * (1 + 2 * pad));
  return {
    id: item.id,
    slug: item.slug,
    bounds: item.bounds,
    mask: Uint32Array.from(item.mask.map((row) => Number.parseInt(row, 16))),
    sharp: responsive(item.sharp['1x'], item.sharp['2x'], [
      FOOD_SPRITE_SIZE_1X,
      FOOD_SPRITE_SIZE_1X * 2,
    ]),
    blurred: responsive(item.blurred['1x'], item.blurred['2x'], [blurredWidth(1), blurredWidth(2)]),
    blurPadRatio: pad,
  };
});

const team = manifest.team;

type Logo = { readonly width: number } & Variants;
type Background = { readonly variants: Readonly<Record<string, Variants>> };

function logo({ width, avif, webp }: Logo): ResponsiveImage {
  return {
    avifSrcSet: `${url(avif)} ${String(width)}w`,
    webpSrcSet: `${url(webp)} ${String(width)}w`,
    fallback: url(webp),
  };
}

function background({ variants }: Background): ResponsiveImage {
  const entries = Object.entries(variants).sort(([a], [b]) => Number(a) - Number(b));
  const srcSet = (format: keyof Variants) =>
    entries.map(([width, files]) => `${url(files[format])} ${width}w`).join(', ');
  const largest = entries.at(-1)?.[1];
  if (!largest) throw new Error('A team background has no variants — run "npm run assets"');
  return { avifSrcSet: srcSet('avif'), webpSrcSet: srcSet('webp'), fallback: url(largest.webp) };
}

export const images: Readonly<Record<ImageKey, ResponsiveImage>> = {
  teamLogo: logo(team.logo),
  projectLogo: logo(team.projectLogo),
  teamBackground: background(team.background),
  teamBackgroundPhone: background(team.backgroundPhone),
};
