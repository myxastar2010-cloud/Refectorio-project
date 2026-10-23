import { INPUT_LIMITS } from '@refectorio/nutrition-core';
import { IconX } from '@tabler/icons-react';
import { m } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { DURATION, QUIZ } from '../../../motion/tokens';
import { PillButton } from './PillButton';
import { useShapeMorph } from './useShapeMorph';

type Props = {
  /** The «+» oval the panel grows out of (and returns into when cancelled). */
  readonly anchor: HTMLElement | null;
  readonly calm: boolean;
  readonly title: string;
  readonly placeholder: string;
  /** «Готово» with text: store the item and return the chip it became (the panel collapses into it). */
  readonly onSubmit: (text: string) => HTMLElement | null;
  /** The panel starts closing: the chips come back under it. */
  readonly onClosing: () => void;
  /** The panel sits on its target; `added` — an item was stored. */
  readonly onClosed: (added: boolean) => void;
};

/**
 * «Добавить другое» (ТЗ §8.5, design «подвопрос 26»): the «+» oval morphs into a large rounded panel with a title,
 * × close, a pill input and «Готово»; «Готово» collapses it into the new selected chip (taking the chip's ink on the
 * way), Esc or × returns it into «+». Not a dialog: it stands in for the chip cloud, the rest of the step stays usable.
 */
export function AddPanel({
  anchor,
  calm,
  title,
  placeholder,
  onSubmit,
  onClosing,
  onClosed,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [text, setText] = useState('');
  // From «Готово» or × on, the panel is only a shape flying home: no longer reachable or announced.
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const intoChip = useRef(false);

  const onFrame = useCallback((progress: number) => {
    const ink = inkRef.current;
    if (!ink) return;
    const share = intoChip.current ? Math.max(0, 1 - progress / QUIZ.panelContentAt) : 0;
    ink.style.opacity = share.toFixed(3);
  }, []);
  const { close } = useShapeMorph({ panelRef, contentRef, anchor, calm, onFrame });

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const finish = async (submit: boolean) => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    const value = text.trim();
    const target = submit && value ? onSubmit(value) : null;
    intoChip.current = target !== null;
    onClosing();
    await close(target ?? anchor);
    onClosed(target !== null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      void finish(false);
    } else if (event.key === 'Enter' && event.target === inputRef.current) {
      event.preventDefault();
      void finish(true);
    }
  };

  return (
    <m.div
      ref={panelRef}
      className="quiz-add"
      role="group"
      aria-labelledby={titleId}
      inert={leaving}
      aria-hidden={leaving || undefined}
      onKeyDown={onKeyDown}
      initial={calm ? { opacity: 0 } : false}
      animate={{ opacity: 1, transition: { duration: DURATION.fade } }}
      exit={{ opacity: 0, transition: { duration: calm ? DURATION.fade : DURATION.micro } }}
    >
      <span ref={inkRef} className="quiz-add-ink" aria-hidden />
      <div ref={contentRef} className="quiz-add-content">
        <div className="quiz-add-head">
          <h3 className="quiz-add-title" id={titleId}>
            {title}
          </h3>
          <button
            type="button"
            className="quiz-close"
            aria-label={quiz.common.close}
            onClick={() => {
              void finish(false);
            }}
          >
            <IconX aria-hidden stroke={2} />
          </button>
        </div>
        <input
          ref={inputRef}
          className="quiz-add-input"
          type="text"
          value={text}
          maxLength={INPUT_LIMITS.customItemMaxLength}
          placeholder={placeholder}
          aria-labelledby={titleId}
          enterKeyHint="done"
          autoComplete="off"
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
        <PillButton
          tone="accent"
          className="quiz-add-done"
          onClick={() => {
            void finish(true);
          }}
        >
          {quiz.common.done}
        </PillButton>
      </div>
    </m.div>
  );
}
