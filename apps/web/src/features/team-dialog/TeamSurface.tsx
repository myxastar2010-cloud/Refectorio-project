import { m } from 'motion/react';
import { images } from '../../lib/assets';
import { DIALOG, SPRING } from '../../motion/tokens';
import { useCalmMotion } from '../../motion/hooks';
import { useViewport } from '../../lib/useViewport';

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
  const viewport = useViewport();
  const dialog = mode === 'dialog';
  // Motion animates and corrects the radius only from pixel values.
  const radius = dialog
    ? viewport.phone
      ? DIALOG.phoneDialogRadiusPx
      : DIALOG.dialogRadius * viewport.sd
    : DIALOG.tileRadius * (viewport.phone ? viewport.width / DIALOG.phoneFrameWidth : viewport.s);
  // The dialog surface animates the opening; the tile surface takes over (and animates) the closing.
  const spring = dialog ? SPRING.expand : SPRING.collapse;
  const shape = calm ? { duration: 0.2 } : spring;
  const crossfade = calm ? 0.2 : SPRING.expand.visualDuration * DIALOG.logoCrossfadeEnd;
  // Closing: the logo comes back at the very end of the way.
  const closingDelay = calm ? 0 : SPRING.collapse.visualDuration * (1 - DIALOG.logoCrossfadeEnd);

  return (
    <m.div
      layoutId={TEAM_LAYOUT_ID}
      className={dialog ? 'team-surface team-surface--dialog' : 'team-surface'}
      style={{ borderRadius: radius }}
      transition={shape}
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
