import { INPUT_LIMITS } from '@refectorio/nutrition-core';
import { useLayoutEffect, useRef, useState } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { ContinueButton } from '../components/PillButton';
import { StepFrame } from '../components/StepFrame';
import { useEnterToContinue } from '../components/useEnterToContinue';
import { useKeyboardSafe } from '../components/useKeyboardSafe';
import { stepDef } from '../flow/steps';
import { fill, useQuiz } from '../quizContext';

type Step = 'dislikesText' | 'notes';

/** The counter appears when this share of the limit is left (ТЗ §8.6: «a counter near the limit»). */
const COUNTER_FROM_SHARE = 0.2;
/** Screen readers hear the counter only when it crosses these marks (ascending), not on every key. */
const ANNOUNCE_AT = [0, 10, 20] as const;

/** Text below the field's visible end: its edge fades (quiz.css «data-clipped»). */
const markClipped = (field: HTMLTextAreaElement) => {
  field.toggleAttribute(
    'data-clipped',
    field.scrollTop + field.clientHeight < field.scrollHeight - 1,
  );
};

/**
 * «Какие продукты вы не любите?» and «Что нам следует знать?» (ТЗ §8.6): a large rounded text field that grows with
 * the text, a counter near the limit, «Готово». Notes are optional; Ctrl/⌘ + Enter finishes from the field.
 */
export function TextStep({ step }: { readonly step: Step }) {
  const { state, patch, next } = useQuiz();
  const a = state.answers;
  const notes = step === 'notes';
  const value = notes ? a.notes : a.dislikesText;
  const max = notes ? INPUT_LIMITS.notesMaxLength : INPUT_LIMITS.dislikesOtherMaxLength;
  const left = max - value.length;
  const complete = stepDef(step).complete(a);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [heard, setHeard] = useState<{ mark: number; left: number } | null>(null);

  useEnterToContinue(complete, next);
  useKeyboardSafe(fieldRef);

  // Autosize: the field grows with its text inside the panel (min and max height from CSS); beyond its max it scrolls.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
    markClipped(field);
  }, [value]);

  // React's «adjust state while rendering»: the mark to announce changes only when a mark is crossed.
  const mark = ANNOUNCE_AT.find((at) => left <= at) ?? null;
  if (mark !== (heard?.mark ?? null)) setHeard(mark === null ? null : { mark, left });

  const counterId = `quiz-counter-${step}`;
  return (
    <StepFrame
      icon={stepDef(step).icon}
      title={notes ? quiz.notes.title : quiz.dislikes.textTitle}
      footer={<ContinueButton show={complete} label={quiz.common.done} onClick={next} />}
      className="quiz-frame--text"
    >
      <div className="quiz-textarea">
        <textarea
          ref={fieldRef}
          className="quiz-textarea-field"
          value={value}
          maxLength={max}
          rows={3}
          placeholder={notes ? quiz.notes.placeholder : quiz.dislikes.placeholder}
          aria-labelledby="quiz-step-title"
          aria-describedby={counterId}
          onChange={(event) => {
            patch(notes ? { notes: event.target.value } : { dislikesText: event.target.value });
          }}
          onScroll={(event) => {
            markClipped(event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && complete) {
              event.preventDefault();
              next();
            }
          }}
        />
        <span className="quiz-counter" id={counterId}>
          {left <= max * COUNTER_FROM_SHARE ? fill(quiz.common.counter, { left }) : null}
        </span>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {heard === null ? '' : fill(quiz.common.counter, { left: heard.left })}
      </p>
    </StepFrame>
  );
}
