import { IconX } from '@tabler/icons-react';
import { AnimatePresence, m, usePresence } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { revealMotion, useCornerMorph } from '../../../motion/cornerMorph';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION, MORPH } from '../../../motion/tokens';
import { deleteAll } from '../flow/persistence';
import { PillButton } from './PillButton';
import { useModal } from './useModal';

type Props = {
  readonly open: boolean;
  /** The label that opened it: the sheet grows out of it and returns into it; focus goes back there. */
  readonly returnFocusTo: HTMLElement | null;
  readonly onClose: () => void;
  /** «Удалить мои ответы» confirmed: the draft and the result are gone, the quiz starts over. */
  readonly onDeleted: () => void;
};

type Reveal = (index: number) => ReturnType<typeof revealMotion>;

function SheetContent({
  onClose,
  onDeleted,
  reveal,
}: Pick<Props, 'onClose' | 'onDeleted'> & { readonly reveal: Reveal }) {
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  // The button that was pressed disappears: the focus goes to the next sensible place, never to the page (WCAG 2.4.3).
  const deleteRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (deleted) doneRef.current?.focus();
    else if (confirming) cancelRef.current?.focus();
    else if (asked.current) deleteRef.current?.focus();
    asked.current = confirming || asked.current;
  }, [confirming, deleted]);
  return (
    <>
      <m.div className="quiz-sheet-head" {...reveal(0)}>
        <h2 className="quiz-sheet-title" id="quiz-privacy-title">
          {quiz.privacy.title}
        </h2>
        <button
          type="button"
          className="quiz-close"
          aria-label={quiz.common.close}
          onClick={onClose}
        >
          <IconX aria-hidden stroke={2} />
        </button>
      </m.div>
      <m.ul className="quiz-sheet-list" {...reveal(1)}>
        {quiz.privacy.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </m.ul>
      <m.div className="quiz-sheet-actions" aria-live="polite" {...reveal(2)}>
        {deleted ? (
          <p ref={doneRef} className="quiz-sheet-done" tabIndex={-1}>
            {quiz.privacy.deleted}
          </p>
        ) : confirming ? (
          <>
            <p className="quiz-sheet-confirm">{quiz.privacy.deleteConfirm}</p>
            <PillButton
              tone="accent"
              onClick={() => {
                deleteAll();
                setDeleted(true);
                onDeleted();
              }}
            >
              {quiz.privacy.deleteYes}
            </PillButton>
            <PillButton
              tone="outline"
              buttonRef={cancelRef}
              onClick={() => {
                setConfirming(false);
              }}
            >
              {quiz.privacy.deleteNo}
            </PillButton>
          </>
        ) : (
          <PillButton
            tone="outline"
            buttonRef={deleteRef}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {quiz.privacy.deleteAnswers}
          </PillButton>
        )}
      </m.div>
    </>
  );
}

function SheetBody({
  anchor,
  onClose,
  onDeleted,
}: {
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}) {
  const [present, safeToRemove] = usePresence();
  const calm = useCalmMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  const [revealed, setRevealed] = useState(false);
  // The dialog stops being one as soon as it starts closing: the step behind is usable while the shape flies home.
  useModal({ open: present, containerRef: panelRef, onClose, returnFocusTo: anchor });
  useCornerMorph({
    surface: surfaceRef,
    anchor: anchorRef,
    present,
    calm,
    fadeBelow: MORPH.labelFadeBelow,
    onReveal: () => {
      setRevealed(true);
    },
    onLanded: () => undefined,
    onDone: () => {
      safeToRemove?.();
    },
  });
  return (
    <div className="quiz-sheet-layer" inert={!present}>
      <m.div
        className="quiz-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: DURATION.scrim } }}
        exit={{ opacity: 0, transition: { duration: DURATION.scrimOut } }}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className="quiz-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-privacy-title"
      >
        <div ref={surfaceRef} className="quiz-sheet-surface" aria-hidden />
        <SheetContent
          onClose={onClose}
          onDeleted={onDeleted}
          reveal={(index) => revealMotion(index, revealed, calm)}
        />
      </div>
    </div>
  );
}

/**
 * The privacy sheet (ТЗ §11.3): grows out of its label with the team card's corner morph, the step behind dims and
 * blurs (QuizScene marks the quiz), the text arrives at ≈ 70 % of the shape; closing is the reverse, 1.5× faster. A
 * dialog: focus trap, Esc, focus return, inert background.
 */
export function PrivacySheet({ open, returnFocusTo, onClose, onDeleted }: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <SheetBody key="privacy" anchor={returnFocusTo} onClose={onClose} onDeleted={onDeleted} />
      ) : null}
    </AnimatePresence>
  );
}
