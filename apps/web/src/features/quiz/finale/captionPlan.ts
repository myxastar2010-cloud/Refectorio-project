import { quiz } from '../../../content/quiz.ru';
import { FINALE } from '../../../motion/tokens';

export type Caption = { readonly text: string; readonly icon: string };

/** The captions, with number-focused ones swapped when numbers are de-emphasised (ТЗ §8.7). */
export function captionsFor(deemphasizeNumbers: boolean): readonly Caption[] {
  const { replace, with: calmText } = quiz.finale.captionsCalm;
  return quiz.finale.captions.map((caption) =>
    deemphasizeNumbers && caption.text === replace ? { text: calmText, icon: 'scale' } : caption,
  );
}

/** «Slightly irregular» 2.2–3.2 s per caption (fixed shares, so videos and tests repeat). */
const RHYTHM = [0.35, 0.8, 0.5, 0.95, 0.25, 0.7, 0.55, 0.4] as const;
export const captionDurationMs = (index: number) =>
  FINALE.captionMinMs +
  (RHYTHM[index % RHYTHM.length] ?? 0.5) * (FINALE.captionMaxMs - FINALE.captionMinMs);
