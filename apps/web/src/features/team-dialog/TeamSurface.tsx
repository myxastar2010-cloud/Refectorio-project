import type { Ref } from 'react';
import { images } from '../../lib/assets';
import { CARD_PICTURE_SIZES } from './preload';

type DialogSurfaceProps = {
  readonly surfaceRef: Ref<HTMLDivElement>;
  readonly pictureRef: Ref<HTMLImageElement>;
  readonly logoRef: Ref<HTMLImageElement>;
};

/**
 * The team card surface at its final size (ТЗ 6.4). useCornerMorph squeezes it onto the icon and lets it stretch
 * open. The picture is the same star as the team icon (the icon is a square of it), so at the icon the card shows
 * exactly the icon; the icon's own logo lies on top for the first frames and fades out.
 */
export function TeamDialogSurface({ surfaceRef, pictureRef, logoRef }: DialogSurfaceProps) {
  return (
    <div ref={surfaceRef} className="team-surface">
      <picture className="team-surface-picture">
        <source type="image/avif" srcSet={images.teamCard.avifSrcSet} sizes={CARD_PICTURE_SIZES} />
        <img
          ref={pictureRef}
          src={images.teamCard.fallback}
          srcSet={images.teamCard.webpSrcSet}
          sizes={CARD_PICTURE_SIZES}
          alt=""
          decoding="async"
        />
      </picture>
      <picture className="team-surface-logo">
        <source type="image/avif" srcSet={images.teamLogo.avifSrcSet} />
        <img
          ref={logoRef}
          src={images.teamLogo.fallback}
          srcSet={images.teamLogo.webpSrcSet}
          alt=""
        />
      </picture>
    </div>
  );
}

/** The team logo in the icon of part 2. Hidden while its card is out (open or flying). */
export function TeamTileArt({ hidden }: { readonly hidden: boolean }) {
  return (
    <picture className="team-tile-art" style={hidden ? { visibility: 'hidden' } : undefined}>
      <source type="image/avif" srcSet={images.teamLogo.avifSrcSet} />
      <img src={images.teamLogo.fallback} srcSet={images.teamLogo.webpSrcSet} alt="" />
    </picture>
  );
}
