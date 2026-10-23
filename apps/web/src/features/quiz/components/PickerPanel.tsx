import { IconX } from '@tabler/icons-react';
import { AnimatePresence, animate, m, usePresence } from 'motion/react';
import clsx from 'clsx';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { quiz } from '../../../content/quiz.ru';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION } from '../../../motion/tokens';
import { PillButton } from './PillButton';
import { useModal } from './useModal';
import { useShapeMorph } from './useShapeMorph';

type Props = {
  readonly open: boolean;
  /** The row the panel grows out of (desktop) and returns into. */
  readonly anchor: HTMLElement | null;
  readonly title: string;
  readonly hint?: string | null;
  readonly children: ReactNode;
  /** «Готово» (or Enter on the control). */
  readonly onDone: () => void;
  /** ×, Esc, a click outside: nothing changes. */
  readonly onCancel: () => void;
  /** Without «Готово» (the sex sheet commits by its two buttons). */
  readonly withDone?: boolean;
  readonly titleId: string;
};

const PHONE = '(max-width: 47.99rem)';

/**
 * The panel grows out of its row (useShapeMorph) and returns into it on ×, Esc, a click outside or «Готово» (4.6) —
 * on desktop into a panel, on phones into the bottom sheet. Reduced motion: a short fade.
 */
function MorphingPanel({
  anchor,
  calm,
  sheet,
  children,
  ...dialog
}: {
  readonly anchor: HTMLElement | null;
  readonly calm: boolean;
  readonly sheet: boolean;
  readonly children: ReactNode;
  readonly role: string;
  readonly 'aria-modal': 'true';
  readonly 'aria-labelledby': string;
  readonly panelRef: RefObject<HTMLDivElement | null>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { panelRef, ...attributes } = dialog;
  const { close } = useShapeMorph({ panelRef, contentRef, anchor, calm });
  const [isPresent, safeToRemove] = usePresence();

  useEffect(() => {
    if (isPresent) return;
    const panel = panelRef.current;
    if (!panel) {
      safeToRemove();
      return;
    }
    if (calm || !anchor) {
      void animate(panel, { opacity: 0 }, { duration: DURATION.fade }).then(safeToRemove);
      return;
    }
    void close().then(safeToRemove);
  }, [isPresent, safeToRemove, calm, anchor, close, panelRef]);

  return (
    <div
      ref={panelRef}
      className={clsx('quiz-picker', sheet && 'quiz-picker--sheet')}
      {...attributes}
    >
      <div ref={contentRef} className="quiz-picker-content">
        {children}
      </div>
    </div>
  );
}

/** The picker panel of a row (ТЗ §8.3): grows out of the row — on desktop into a panel, on phones into a sheet. */
export function PickerPanel({
  open,
  anchor,
  title,
  hint,
  children,
  onDone,
  onCancel,
  withDone = true,
  titleId,
}: Props) {
  const calm = useCalmMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [phone] = useState(() => window.matchMedia(PHONE).matches);
  useModal({ open, containerRef: panelRef, onClose: onCancel, returnFocusTo: anchor });
  const body = (
    <>
      <div className="quiz-picker-head">
        <h3 className="quiz-picker-title" id={titleId}>
          {title}
        </h3>
        <button
          type="button"
          className="quiz-close"
          aria-label={quiz.common.close}
          onClick={onCancel}
        >
          <IconX aria-hidden stroke={2} />
        </button>
      </div>
      {hint ? <p className="quiz-picker-hint">{hint}</p> : null}
      <div className="quiz-picker-control">{children}</div>
      {withDone ? (
        <PillButton tone="accent" onClick={onDone} className="quiz-picker-done">
          {quiz.common.done}
        </PillButton>
      ) : null}
    </>
  );
  // Rendered at the quiz root: the step's animated blocks keep a transform, which would trap a fixed panel.
  const host = document.querySelector<HTMLElement>('.quiz') ?? document.body;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="quiz-picker-layer" key="picker" data-phone={phone || undefined}>
          <m.div
            className="quiz-scrim quiz-scrim--light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DURATION.micro } }}
            exit={{ opacity: 0, transition: { duration: DURATION.micro } }}
            onClick={onCancel}
            aria-hidden
          />
          <MorphingPanel
            anchor={anchor}
            calm={calm}
            sheet={phone}
            panelRef={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            {body}
          </MorphingPanel>
        </div>
      ) : null}
    </AnimatePresence>,
    host,
  );
}
