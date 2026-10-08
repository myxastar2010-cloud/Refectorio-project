import { images } from '../../lib/assets';

/**
 * Rendered width of the card picture: nearly the whole width on phones; on desktops and tablets the picture spans
 * the card, 1401 of 1920 mockup px.
 */
export const CARD_PICTURE_SIZES = '(max-width: 767px) calc(100vw - 32px), 73vw';

let preloaded = false;

/**
 * Fetch and decode the card picture ahead of the first opening (it is not on the first screen): decoding a big image
 * on the first frame of the card's flight would stall it. The same srcset and sizes as the card, so the browser picks
 * the same file (AVIF where supported).
 */
export function preloadTeamPicture() {
  if (preloaded) return;
  preloaded = true;
  const picture = document.createElement('picture');
  const source = document.createElement('source');
  source.type = 'image/avif';
  source.srcset = images.teamCard.avifSrcSet;
  source.sizes = CARD_PICTURE_SIZES;
  const img = document.createElement('img');
  img.decoding = 'async';
  img.sizes = CARD_PICTURE_SIZES;
  img.srcset = images.teamCard.webpSrcSet;
  img.src = images.teamCard.fallback;
  picture.append(source, img);
  img.decode().catch(() => {
    // Not decodable now (e.g. offline): the card simply decodes it when it opens.
  });
}
