import type { Ref } from 'react';
import { images } from '../../lib/assets';
import { DIALOG_SIZES } from './preload';

type DialogSurfaceProps = {
  readonly surfaceRef: Ref<HTMLDivElement>;
  readonly logoRef: Ref<HTMLPictureElement>;
  readonly radiusPx: number;
};

/**
 * The team card surface at its final size (ТЗ 6.4). useCornerMorph squeezes it onto the icon and lets it stretch
 * open; the logo on top fades into the card background during the first part of the way. The logo is stretched to
 * the card's proportions (object-fit: fill), so squeezed back onto the square icon it looks exactly like the icon.
 */
export function TeamDialogSurface({ surfaceRef, logoRef, radiusPx }: DialogSurfaceProps) {
  return (
    <div
      ref={surfaceRef}
      className="team-surface team-surface--dialog"
      style={{ borderRadius: radiusPx }}
    >
      <picture className="team-surface-bg">
        <source type="image/avif" srcSet={images.teamBackground.avifSrcSet} sizes={DIALOG_SIZES} />
        <img
          src={images.teamBackground.fallback}
          srcSet={images.teamBackground.webpSrcSet}
          sizes={DIALOG_SIZES}
          alt=""
          decoding="async"
        />
      </picture>
      <picture ref={logoRef} className="team-surface-logo">
        <source type="image/avif" srcSet={images.teamLogo.avifSrcSet} />
        <img src={images.teamLogo.fallback} srcSet={images.teamLogo.webpSrcSet} alt="" />
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
