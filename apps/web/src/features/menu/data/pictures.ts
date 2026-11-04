import manifest from '../../../assets/generated/menu/manifest.json';

/**
 * The menu's own pictures (scripts/optimize-assets.mjs → generated/menu/): the nine avatars, Kiki, the three quick
 * cards and the letters' images, AVIF + WebP at 1× and 2×. The menu chunk carries them, the landing does not.
 */
const urls = import.meta.glob<string>('../../../assets/generated/menu/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

type Variant = { readonly avif: string; readonly webp: string };
type Entry = {
  readonly width: number;
  readonly height: number;
  readonly '1x': Variant;
  readonly '2x': Variant;
};

export type Picture = {
  readonly width: number;
  readonly height: number;
  readonly avifSrcSet: string;
  readonly webpSrcSet: string;
  readonly src: string;
};

function url(file: string): string {
  const found = urls[`../../../assets/generated/${file}`];
  if (!found) throw new Error(`Generated image is missing: ${file} — run "npm run assets"`);
  return found;
}

function picture(entry: Entry): Picture {
  return {
    width: entry.width,
    height: entry.height,
    avifSrcSet: `${url(entry['1x'].avif)} 1x, ${url(entry['2x'].avif)} 2x`,
    webpSrcSet: `${url(entry['1x'].webp)} 1x, ${url(entry['2x'].webp)} 2x`,
    src: url(entry['1x'].webp),
  };
}

export const AVATARS: readonly Picture[] = manifest.avatars.map(picture);
export const KIKI: Picture = picture(manifest.kiki);
export const QUICK: readonly Picture[] = manifest.quick.map(picture);
export const LETTER_PICTURES: readonly Picture[] = manifest.letters.map(picture);
