import { IconX } from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { quiz } from '../../../content/quiz.ru';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION, QUIZ } from '../../../motion/tokens';
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

/** The desktop panel: grows out of its row (useShapeMorph) and fades away on cancel or «Готово». */
function MorphingPanel({
  anchor,
  calm,
  children,
  ...dialog
}: {
  readonly anchor: HTMLElement | null;
  readonly calm: boolean;
  readonly children: ReactNode;
  readonly role: string;
  readonly 'aria-modal': 'true';
  readonly 'aria-labelledby': string;
  readonly panelRef: RefObject<HTMLDivElement | null>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { panelRef, ...attributes } = dialog;
  useShapeMorph({ panelRef, contentRef, anchor, calm });

  return (
    <m.div
      ref={panelRef}
      className="quiz-picker"
      {...attributes}
      exit={
        calm || !anchor
          ? { opacity: 0, transition: { duration: DURATION.fade } }
          : { opacity: 0, transition: { duration: DURATION.micro } }
      }
    >
      <div ref={contentRef} className="quiz-picker-content">
        {children}
      </div>
    </m.div>
  );
}

/** The picker panel of a row (ТЗ §8.3): desktop — grows out of the row; phones — a bottom sheet. */
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
          {phone ? (
            <m.div
              ref={panelRef}
              className="quiz-picker quiz-picker--sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={calm ? { opacity: 0 } : { transform: 'translateY(100%)' }}
              animate={{
                opacity: 1,
                transform: 'translateY(0%)',
                transition: calm
                  ? { duration: DURATION.fade }
                  : { type: 'spring', ...QUIZ.panelSpring },
              }}
              exit={
                calm
                  ? { opacity: 0, transition: { duration: DURATION.fade } }
                  : { transform: 'translateY(100%)', transition: { duration: DURATION.micro } }
              }
            >
              {body}
            </m.div>
          ) : (
            <MorphingPanel
              anchor={anchor}
              calm={calm}
              panelRef={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              {body}
            </MorphingPanel>
          )}
        </div>
      ) : null}
    </AnimatePresence>,
    host,
  );
}
