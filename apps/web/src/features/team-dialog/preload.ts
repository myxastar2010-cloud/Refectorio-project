import { images } from '../../lib/assets';

/** The card is 1401 of 1920 mockup px wide on desktop and the whole screen on phones. */
export const DIALOG_SIZES = '(max-width: 767px) 100vw, 73vw';

let backgroundPreloaded = false;

/**
 * Fetch and decode the card background ahead of the first opening (it is not on the first screen): decoding a big
 * image on the first frame of the card's flight would stall it. The same <picture> markup as the card, so the
 * browser picks the same file (AVIF where supported).
 */
export function preloadTeamBackground() {
  if (backgroundPreloaded) return;
  backgroundPreloaded = true;
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.type = 'image/avif';
  source.srcset = images.teamBackground.avifSrcSet;
  source.sizes = DIALOG_SIZES;
  const img = document.createElement('img');
  img.decoding = 'async';
  img.sizes = DIALOG_SIZES;
  img.srcset = images.teamBackground.webpSrcSet;
  img.src = images.teamBackground.fallback;
  picture.append(source, img);
  img.decode().catch(() => {
    // Not decodable now (e.g. offline): the card simply decodes it when it opens.
  });
}
