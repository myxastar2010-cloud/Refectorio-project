import { DURATION, EASE_IN_OUT, EASE_OUT_SOFT, QUIZ } from '../../../motion/tokens';

/** Sheets and notice cards rise a little and come into focus; reduced motion — a fade. */
export const sheetMotion = (calm: boolean) =>
  calm
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: DURATION.fade } },
        exit: { opacity: 0, transition: { duration: DURATION.fade } },
      }
    : {
        initial: { opacity: 0, transform: `translateY(${QUIZ.sheet.risePx}px) scale(0.98)` },
        animate: {
          opacity: 1,
          transform: 'translateY(0px) scale(1)',
          transition: { duration: QUIZ.sheet.durationMs / 1000, ease: EASE_OUT_SOFT },
        },
        exit: {
          opacity: 0,
          transform: `translateY(${QUIZ.sheet.risePx / 2}px) scale(0.98)`,
          transition: { duration: (QUIZ.sheet.durationMs * 0.7) / 1000, ease: EASE_IN_OUT },
        },
      };
