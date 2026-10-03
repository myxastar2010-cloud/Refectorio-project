import { m } from 'motion/react';
import { images } from '../../lib/assets';
import { DIALOG, SPRING } from '../../motion/tokens';
import { useCalmMotion } from '../../motion/hooks';

export const TEAM_LAYOUT_ID = 'team-card';

type Props = {
  readonly mode: 'tile' | 'dialog';
  /** Skip the logo/background cross-fade (first render of the page). */
  readonly still: boolean;
};

/**
 * The shared element of the team card (ТЗ 6.4): the same layoutId lives in the tile and in the dialog, so Motion
 * morphs one into the other with the radius animated without distortion. The team logo cross-fades into the card
 * background during the first ~18 % of the expansion; the background is counter-scaled (`layout`) so the growing
 * window reveals it like an app launch instead of stretching it.
 */
export function TeamSurface({ mode, still }: Props) {
  const calm = useCalmMotion();
  const dialog = mode === 'dialog';
  const expand = calm ? { duration: 0.2 } : SPRING.expand;
  const crossfade = calm ? 0.2 : SPRING.expand.visualDuration * DIALOG.logoCrossfadeEnd;
  // Closing: the logo comes back at the very end of the way.
  const closingDelay = calm ? 0 : SPRING.expand.visualDuration * (1 - DIALOG.logoCrossfadeEnd);

  return (
    <m.div
      layoutId={TEAM_LAYOUT_ID}
      className={dialog ? 'team-surface team-surface--dialog' : 'team-surface'}
      style={{ borderRadius: 'var(--team-surface-radius)' }}
      transition={expand}
    >
      <m.picture
        layout
        className="team-surface-bg"
        initial={still ? false : { opacity: dialog ? 0 : 1 }}
        animate={{ opacity: dialog ? 1 : 0 }}
        transition={{ opacity: { duration: crossfade, delay: dialog ? 0 : closingDelay * 0.8 } }}
      >
        <source type="image/avif" srcSet={images.teamBackground.avifSrcSet} sizes="100vw" />
        <img
          src={images.teamBackground.fallback}
          srcSet={images.teamBackground.webpSrcSet}
          sizes="100vw"
          alt=""
        />
      </m.picture>
      <m.picture
        className="team-surface-logo"
        initial={still ? false : { opacity: dialog ? 1 : 0 }}
        animate={{ opacity: dialog ? 0 : 1 }}
        transition={{ opacity: { duration: crossfade, delay: dialog ? 0 : closingDelay } }}
      >
        <source type="image/avif" srcSet={images.teamLogo.avifSrcSet} />
        <img src={images.teamLogo.fallback} srcSet={images.teamLogo.webpSrcSet} alt="" />
      </m.picture>
    </m.div>
  );
}
