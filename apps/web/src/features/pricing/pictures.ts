import manifest from '../../assets/generated/pricing/manifest.json';

/**
 * The plan cards' backgrounds (the team's «карточки тарифов»): six for the free plan, six for Premium, each Premium
 * one with its fully blurred copy for «Ещё...». Every visit to «Цены» shows another pair, chosen at random.
 */
const urls = import.meta.glob<string>('../../assets/generated/pricing/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function url(file: string): string {
  const found = urls[`../../assets/generated/${file}`];
  if (!found) throw new Error(`Generated image is missing: ${file} — run "npm run assets"`);
  return found;
}

export type CardPicture = { readonly avif: string; readonly webp: string };

export type PlanPictures = {
  readonly free: CardPicture;
  readonly premium: CardPicture;
  /** The same picture as `premium`, fully blurred: the card with «Ещё...» open. */
  readonly premiumOpen: CardPicture;
};

type Variants = { readonly avif: string; readonly webp: string };
const resolve = (variants: Variants): CardPicture => ({
  avif: url(variants.avif),
  webp: url(variants.webp),
});

const FREE = manifest.free.map(resolve);
const PREMIUM = manifest.premium.map(resolve);
const PREMIUM_OPEN = manifest.premiumOpen.map(resolve);

/** The pictures' own size (the mockup's cards are drawn at it). */
export const CARD_PICTURE = { width: manifest.width, height: manifest.height } as const;

/** A random index below `count` other than `previous` (when there is another one): a visit never repeats the last. */
export function pickOther(count: number, previous: number | null, random: () => number): number {
  if (count <= 1 || previous === null) return Math.floor(random() * count);
  const index = Math.floor(random() * (count - 1));
  return index >= previous ? index + 1 : index;
}

function at(list: readonly CardPicture[], index: number): CardPicture {
  const picture = list[index];
  if (!picture) throw new Error(`No plan card picture ${String(index)}`);
  return picture;
}

let last: { free: number; premium: number } | null = null;

/** The pictures of the next visit: another free and another Premium card than the last time. */
export function pickPictures(random: () => number = Math.random): PlanPictures {
  const free = pickOther(FREE.length, last?.free ?? null, random);
  const premium = pickOther(PREMIUM.length, last?.premium ?? null, random);
  last = { free, premium };
  return {
    free: at(FREE, free),
    premium: at(PREMIUM, premium),
    premiumOpen: at(PREMIUM_OPEN, premium),
  };
}

/**
 * Fetches and decodes a picture the way the page will show it (AVIF where the browser takes it, WebP otherwise): an
 * unattached <picture> picks its source like an attached one.
 */
function load(picture: CardPicture): Promise<void> {
  const holder = document.createElement('picture');
  const source = document.createElement('source');
  source.type = 'image/avif';
  source.srcset = picture.avif;
  const image = document.createElement('img');
  image.decoding = 'async';
  holder.append(source, image);
  image.src = picture.webp;
  return image.decode().catch(() => undefined);
}

/**
 * Loads the cards a visit starts with (the blurred copy follows, it is needed only on «Ещё...»); resolves when they
 * are ready or after `waitMs`, whichever is first — a slow network never holds the scene back for long.
 */
export function preloadPictures(pictures: PlanPictures, waitMs: number): Promise<void> {
  const first = Promise.all([load(pictures.free), load(pictures.premium)]).then(() => {
    void load(pictures.premiumOpen);
  });
  return Promise.race([
    first,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, waitMs);
    }),
  ]);
}
