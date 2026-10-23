import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import type { ReactNode, Ref } from 'react';
import { useCalmMotion } from '../../../motion/hooks';
import { DURATION, EASE_IN_OUT, EASE_OUT_SOFT, QUIZ } from '../../../motion/tokens';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { assignRef } from './refs';

type Props = {
  /** accent — «Далее», «Готово»; outline — secondary actions; muted — «Пропустить». */
  readonly tone: 'accent' | 'outline' | 'muted';
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly ariaLabel?: string;
};

/** A pill button of the quiz with the landing's wave (ТЗ §7.7): touch fills it first, then it acts. */
export function PillButton({
  tone,
  onClick,
  children,
  className,
  disabled,
  buttonRef,
  ariaLabel,
}: Props) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={(node) => {
        setHost(node);
        assignRef(buttonRef, node);
      }}
      type="button"
      className={clsx('quiz-pill-button wave-host', `quiz-pill-button--${tone}`, className)}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(event) => {
        act(event, onClick);
      }}
      {...handlers}
    >
      <span className="wave-content">{children}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        {children}
      </WaveLayer>
    </button>
  );
}

/** «Далее» / «Готово» rise in once the answer is complete (ТЗ §8.3) and leave when it is not. */
export function ContinueButton({
  show,
  label,
  onClick,
}: {
  readonly show: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  const calm = useCalmMotion();
  const rise = QUIZ.continueIn;
  return (
    <div className="quiz-continue">
      <AnimatePresence initial={false}>
        {show ? (
          <m.div
            key="continue"
            initial={
              calm ? { opacity: 0 } : { opacity: 0, transform: `translateY(${rise.risePx}px)` }
            }
            animate={{
              opacity: 1,
              transform: 'translateY(0px)',
              transition: calm
                ? { duration: DURATION.fade }
                : { duration: rise.durationMs / 1000, ease: EASE_OUT_SOFT },
            }}
            exit={{
              opacity: 0,
              transform: calm ? 'translateY(0px)' : `translateY(${rise.risePx / 2}px)`,
              transition: { duration: DURATION.micro, ease: EASE_IN_OUT },
            }}
          >
            <PillButton tone="accent" onClick={onClick} className="quiz-continue-button">
              {label}
            </PillButton>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
