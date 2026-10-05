import { images, type ResponsiveImage } from '../../lib/assets';

/** Phones get their own, tall card (the same breakpoint as the phone layout). */
export const PHONE_MEDIA = '(max-width: 767px)';
/** The card is 1401 of 1920 mockup px wide on desktops and tablets, nearly the whole width on phones. */
export const DIALOG_SIZES = '73vw';
export const DIALOG_SIZES_PHONE = 'calc(100vw - 32px)';

/** The <source> list of the card background: the phone picture first (by media), then the wide one. */
export const BACKGROUND_SOURCES: readonly {
  readonly media?: string;
  readonly type: string;
  readonly srcSet: string;
  readonly sizes: string;
}[] = [
  {
    media: PHONE_MEDIA,
    type: 'image/avif',
    srcSet: images.teamBackgroundPhone.avifSrcSet,
    sizes: DIALOG_SIZES_PHONE,
  },
  {
    media: PHONE_MEDIA,
    type: 'image/webp',
    srcSet: images.teamBackgroundPhone.webpSrcSet,
    sizes: DIALOG_SIZES_PHONE,
  },
  { type: 'image/avif', srcSet: images.teamBackground.avifSrcSet, sizes: DIALOG_SIZES },
];

export const BACKGROUND_FALLBACK: ResponsiveImage = images.teamBackground;

let backgroundPreloaded = false;

/**
 * Fetch and decode the card background ahead of the first opening (it is not on the first screen): decoding a big
 * image on the first frame of the card's flight would stall it. The same <picture> markup as the card, so the
 * browser picks the same file.
 */
export function preloadTeamBackground() {
  if (backgroundPreloaded) return;
  backgroundPreloaded = true;
  const picture = document.createElement('picture');
  for (const { media, type, srcSet, sizes } of BACKGROUND_SOURCES) {
    const source = document.createElement('source');
    if (media) source.media = media;
    source.type = type;
    source.srcset = srcSet;
    source.sizes = sizes;
    picture.append(source);
  }
  const img = document.createElement('img');
  img.decoding = 'async';
  img.sizes = DIALOG_SIZES;
  img.srcset = BACKGROUND_FALLBACK.webpSrcSet;
  img.src = BACKGROUND_FALLBACK.fallback;
  picture.append(img);
  img.decode().catch(() => {
    // Not decodable now (e.g. offline): the card simply decodes it when it opens.
  });
}
