import { DIALOG, DURATION, EASE_OUT_SOFT, SPRING } from '../tokens';

/**
 * The content of a morphing surface comes in once the shape is open far enough (useCornerMorph onReveal) — by its
 * shape, not by a clock: the flight may start a little later, and the text must never hang in the air outside it.
 * Each block rises 16 px into place with a light bounce, staggered; closing, it goes first and fast.
 */
export function revealMotion(index: number, revealed: boolean, calm: boolean) {
  const delay = (index * DIALOG.contentStaggerMs) / 1000;
  const hidden = { opacity: 0, transform: `translate3d(0px, ${calm ? 0 : 16}px, 0px)` };
  return {
    initial: hidden,
    animate: revealed
      ? {
          opacity: 1,
          transform: 'translate3d(0px, 0px, 0px)',
          transition: calm
            ? { duration: DURATION.fade }
            : {
                default: { ...SPRING.dialogContent, delay },
                opacity: { duration: 0.35, ease: EASE_OUT_SOFT, delay },
              },
        }
      : hidden,
    exit: { opacity: 0, transition: { duration: DIALOG.contentExitS } },
  };
}
