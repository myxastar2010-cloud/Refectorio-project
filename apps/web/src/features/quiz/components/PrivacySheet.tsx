import { IconX } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION } from '../../../motion/tokens';
import { deleteAll } from '../flow/persistence';
import { PillButton } from './PillButton';
import { sheetMotion } from './sheetMotion';
import { useModal } from './useModal';

type Props = {
  readonly open: boolean;
  readonly returnFocusTo: HTMLElement | null;
  readonly onClose: () => void;
  /** «Удалить мои ответы» confirmed: the draft and the result are gone, the quiz starts over. */
  readonly onDeleted: () => void;
};

function SheetContent({ onClose, onDeleted }: Pick<Props, 'onClose' | 'onDeleted'>) {
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
      <div className="quiz-sheet-head">
        <h2 className="quiz-sheet-title" id="quiz-privacy-title">
          {quiz.privacy.title}
        </h2>
        <button
          type="button"
          className="quiz-close focus-ring"
          aria-label={quiz.common.close}
          onClick={onClose}
        >
          <IconX aria-hidden stroke={2} />
        </button>
      </div>
      <ul className="quiz-sheet-list">
        {quiz.privacy.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="quiz-sheet-link">
        <a href={quiz.privacy.creditsUrl} target="_blank" rel="noreferrer" className="focus-ring">
          {quiz.privacy.credits}
        </a>
      </p>
      <div className="quiz-sheet-actions" aria-live="polite">
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
      </div>
    </>
  );
}

/** The privacy sheet (ТЗ §11.3): a dialog — focus trap, Esc, focus return, inert background. */
export function PrivacySheet({ open, returnFocusTo, onClose, onDeleted }: Props) {
  const calm = useCalmMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  useModal({ open, containerRef: panelRef, onClose, returnFocusTo });
  return (
    <AnimatePresence>
      {open ? (
        <div className="quiz-sheet-layer" key="privacy">
          <m.div
            className="quiz-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION.scrim } }}
            exit={{ opacity: 0, transition: { duration: DURATION.scrimOut } }}
            onClick={onClose}
            aria-hidden
          />
          <m.div
            ref={panelRef}
            className="quiz-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-privacy-title"
            {...sheetMotion(calm)}
          >
            <SheetContent onClose={onClose} onDeleted={onDeleted} />
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
