import { useEffect, useRef, useState } from 'react';
import { quiz } from '../../../content/quiz.ru';
import type { HealthChipId } from '../../../content/quizSchema';
import { focusQuietly } from '../../../lib/quietFocus';
import { fill, useQuiz } from '../quizContext';
import { PillButton } from './PillButton';

type Props = {
  /** The conditions to offer: none — nothing is shown. */
  readonly chips: readonly HealthChipId[];
  readonly text: string;
  readonly button: string;
};

/**
 * A condition that matters for the menu, met outside the health question — aspartame among the allergies, «диализ» in
 * the notes (review-health-synonyms.md B.4, 5): the note asks, one press ticks it in the health question. Nothing is
 * ticked without the person.
 */
export function HealthCrossCheck({ chips, text, button }: Props) {
  const { state, patch, announce } = useQuiz();
  const [marked, setMarked] = useState<string | null>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);

  // The button is gone once pressed: the focus stays here, on the line that says what was done.
  useEffect(() => {
    if (marked) focusQuietly(doneRef.current);
  }, [marked]);

  if (marked) {
    return (
      <p ref={doneRef} className="quiz-note" tabIndex={-1}>
        {marked}
      </p>
    );
  }
  if (chips.length === 0) return null;
  const mark = () => {
    const a = state.answers;
    patch({ health: 'yes', healthChips: [...new Set([...a.healthChips, ...chips])] });
    const done = fill(quiz.health.crossChecked, {
      chips: chips.map((chip) => quiz.health.chips[chip]).join(', '),
    });
    setMarked(done);
    announce(done);
  };
  return (
    <div className="quiz-cross-check">
      <p className="quiz-note">{text}</p>
      <PillButton tone="outline" onClick={mark}>
        {button}
      </PillButton>
    </div>
  );
}
