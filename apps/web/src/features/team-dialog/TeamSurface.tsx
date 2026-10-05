import type { Ref } from 'react';
import { images } from '../../lib/assets';
import { BACKGROUND_FALLBACK, BACKGROUND_SOURCES, DIALOG_SIZES } from './preload';

type DialogSurfaceProps = {
  readonly surfaceRef: Ref<HTMLDivElement>;
  readonly logoRef: Ref<HTMLPictureElement>;
  readonly backgroundRef: Ref<HTMLPictureElement>;
};

/**
 * The team card surface at its final size (ТЗ 6.4). useCornerMorph squeezes it onto the icon and lets it stretch
 * open; the logo on top fades into the card background during the first part of the way. The logo is stretched to
 * the card's proportions (object-fit: fill), so squeezed back onto the square icon it looks exactly like the icon.
 * Phones get their own tall background.
 */
export function TeamDialogSurface({ surfaceRef, logoRef, backgroundRef }: DialogSurfaceProps) {
  return (
    <div ref={surfaceRef} className="team-surface team-surface--dialog">
      <picture ref={backgroundRef} className="team-surface-bg">
        {BACKGROUND_SOURCES.map((source) => (
          <source key={`${source.media ?? ''}${source.type}`} {...source} />
        ))}
        <img
          src={BACKGROUND_FALLBACK.fallback}
          srcSet={BACKGROUND_FALLBACK.webpSrcSet}
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
