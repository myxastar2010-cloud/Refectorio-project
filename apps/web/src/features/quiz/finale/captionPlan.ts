import { quiz } from '../../../content/quiz.ru';

export type Caption = { readonly text: string; readonly icon: string };

/** The captions, with number-focused ones swapped when numbers are de-emphasised (ТЗ §8.7). */
export function captionsFor(deemphasizeNumbers: boolean): readonly Caption[] {
  const { replace, with: calmText } = quiz.finale.captionsCalm;
  return quiz.finale.captions.map((caption) =>
    deemphasizeNumbers && caption.text === replace ? { text: calmText, icon: 'scale' } : caption,
  );
}
