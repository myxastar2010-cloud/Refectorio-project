import { AnimatePresence, m } from 'motion/react';
import { useEffect } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION, EASE_OUT_EXPO, QUIZ } from '../../../motion/tokens';
import { fill } from '../quizContext';

type Props = {
  readonly show: boolean;
  readonly number: number;
  readonly onRestart: () => void;
  readonly onDone: () => void;
};

/** A resumed draft: «Продолжаем с вопроса n» with «Начать заново» (ТЗ §7.4); goes away by itself. */
export function ResumeToast({ show, number, onRestart, onDone }: Props) {
  const calm = useCalmMotion();
  useEffect(() => {
    if (!show) return undefined;
    const timer = window.setTimeout(onDone, QUIZ.toastMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [show, onDone]);
  return (
    <div className="quiz-toast-region" role="status" aria-live="polite">
      <AnimatePresence>
        {show ? (
          <m.div
            key="resume"
            className="quiz-toast"
            initial={{ opacity: 0, transform: calm ? 'none' : 'translateY(16px)' }}
            animate={{
              opacity: 1,
              transform: 'translateY(0px)',
              transition: { duration: calm ? DURATION.fade : DURATION.toast, ease: EASE_OUT_EXPO },
            }}
            exit={{ opacity: 0, transition: { duration: DURATION.micro } }}
          >
            <span>{fill(quiz.common.resumeToast, { n: number })}</span>
            <button type="button" className="quiz-toast-action focus-ring" onClick={onRestart}>
              {quiz.common.startOver}
            </button>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
