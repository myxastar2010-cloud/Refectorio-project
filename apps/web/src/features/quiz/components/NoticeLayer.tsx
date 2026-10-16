import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { useRef } from 'react';
import { site } from '../../../content/site.ru';
import { quiz } from '../../../content/quiz.ru';
import type { NoticeId } from '../../../content/quizSchema';
import { DURATION } from '../../../motion/tokens';
import { useQuiz } from '../quizContext';
import { PillButton } from './PillButton';
import { sheetMotion } from './sheetMotion';
import { useModal } from './useModal';

/** Notices that may end the personal path: they also offer the way home. */
const HOME_NOTICES = new Set<NoticeId>(['refused', 'insulinUnknown']);
/** Notices that ask to confirm an answer: «Понимаю, продолжить» or «Выбрать другое». */
const CONFIRM_NOTICES = new Set<NoticeId>(['ketoConfirm']);

function NoticeCard({ id }: { readonly id: NoticeId }) {
  const { dispatch, exit, calm, state } = useQuiz();
  const cardRef = useRef<HTMLDivElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  // Leaving, the card stops being a dialog at once: the step behind (maybe already the next one) is usable and can
  // take focus while the card fades.
  const present = useIsPresent();
  const dismiss = () => {
    if (present) dispatch({ type: 'dismissNotice' });
  };
  useModal({ open: present, containerRef: cardRef, onClose: dismiss, initialFocusRef: okRef });
  const minor = (state.answers.ageYears ?? 30) < 18;
  return (
    <m.div
      ref={cardRef}
      className="quiz-notice"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`quiz-notice-title-${id}`}
      aria-describedby={`quiz-notice-${id}`}
      {...sheetMotion(calm)}
    >
      <h2 className="visually-hidden" id={`quiz-notice-title-${id}`}>
        {quiz.common.noticeTitle}
      </h2>
      <p className="quiz-notice-text" id={`quiz-notice-${id}`}>
        {quiz.notices[id]}
      </p>
      {id === 'eatingDisorder' ? (
        <div className="quiz-helplines">
          <p>{quiz.helplines.title}</p>
          <ul>
            {/* The children's line serves children, teenagers and their parents; adults get the adult one. */}
            <li>{minor ? quiz.helplines.minors : quiz.helplines.adults}</li>
            <li>{quiz.helplines.emergency}</li>
          </ul>
          <p className="quiz-helplines-checked">{quiz.helplines.checked}</p>
        </div>
      ) : null}
      <div className="quiz-notice-actions">
        <PillButton tone="accent" onClick={dismiss} buttonRef={okRef}>
          {CONFIRM_NOTICES.has(id) ? quiz.common.confirmContinue : quiz.common.understood}
        </PillButton>
        {CONFIRM_NOTICES.has(id) ? (
          <PillButton
            tone="outline"
            onClick={() => {
              if (present) dispatch({ type: 'declineNotice' });
            }}
          >
            {quiz.common.chooseOther}
          </PillButton>
        ) : null}
        {HOME_NOTICES.has(id) ? (
          <PillButton tone="outline" onClick={exit}>
            {site.quizShell.exit}
          </PillButton>
        ) : null}
      </div>
    </m.div>
  );
}

/**
 * Kind notices of the safety rules (ТЗ §8.7) shown over the step at the moment they apply; «Понятно» continues.
 * The step behind dims a little.
 */
export function NoticeLayer() {
  const { state } = useQuiz();
  const current = state.notices[0];
  return (
    <div className="quiz-notice-layer" data-open={current ? '' : undefined}>
      <AnimatePresence mode="wait">
        {current ? (
          <m.div
            key={current}
            className="quiz-notice-wrap"
            initial={{ opacity: 1 }}
            exit={{ opacity: 1, transition: { duration: DURATION.micro } }}
          >
            <NoticeCard id={current} />
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
