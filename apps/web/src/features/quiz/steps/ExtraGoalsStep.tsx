import type { ExtraGoal } from '@refectorio/nutrition-core';
import { IconCheck } from '@tabler/icons-react';
import clsx from 'clsx';
import { animate } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { QUIZ } from '../../../motion/tokens';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { digitIndex } from '../components/choice';
import { ContinueButton } from '../components/PillButton';
import { StepFrame } from '../components/StepFrame';
import { useEnterToContinue } from '../components/useEnterToContinue';
import { extraGoalOptions } from '../flow/safety';
import { stepDef } from '../flow/steps';
import { useQuiz } from '../quizContext';
import { quizIcon, type QuizIconName } from '../quizIcons';

const ICONS: Record<ExtraGoal, QuizIconName> = {
  clothesFit: 'o-extra-clothes',
  overallHealth: 'o-extra-health',
  fitness: 'o-extra-fitness',
  energy: 'o-extra-energy',
  sleep: 'o-extra-sleep',
};

/**
 * «Помимо вашей основной цели, что бы вы хотели в себе изменить?» (stage 3, §6; the team's sketch): several answers —
 * a pill with its icon, the label and a round check that fills when chosen; «Готово» rises in once one is chosen,
 * «Пропустить» goes on with none. Digits 1–5 toggle the n-th answer, as they choose one on a single-choice step.
 */
export function ExtraGoalsStep() {
  const { state, patch, next, calm } = useQuiz();
  const a = state.answers;
  const options = extraGoalOptions(a);
  const chosen = a.extraGoals ?? [];
  const pills = useRef<(HTMLButtonElement | null)[]>([]);
  const done = chosen.length > 0;

  useEnterToContinue(done, next);

  const toggle = (goal: ExtraGoal, element: HTMLElement | null) => {
    patch({
      extraGoals: chosen.includes(goal) ? chosen.filter((g) => g !== goal) : [...chosen, goal],
    });
    // The chips' micro-bounce (ТЗ §7.7); reduced motion — none.
    if (element && !calm) {
      void animate(
        element,
        { transform: [`scale(${QUIZ.chipPressScale})`, 'scale(1)'] },
        QUIZ.chipSpring,
      );
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (state.notices.length > 0 || document.querySelector('[aria-modal="true"]')) return;
      const index = digitIndex(event);
      const goal = index === null ? undefined : options[index];
      if (index === null || !goal) return;
      event.preventDefault();
      const pill = pills.current[index] ?? null;
      pill?.focus();
      toggle(goal, pill);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  return (
    <StepFrame
      icon={stepDef('extraGoals').icon}
      title={quiz.extraGoals.title}
      dense
      className="quiz-frame--extra-goals"
      footer={
        <>
          <ContinueButton show={done} label={quiz.common.done} onClick={next} />
          {done ? null : (
            <SkipButton
              onSkip={() => {
                patch({ extraGoals: [] });
                next();
              }}
            />
          )}
        </>
      }
    >
      <div
        role="group"
        aria-labelledby="quiz-step-title"
        className="quiz-choices quiz-choices--short quiz-choices--multi"
      >
        {options.map((goal, index) => (
          <CheckPill
            key={goal}
            label={quiz.extraGoals.options[goal]}
            icon={ICONS[goal]}
            checked={chosen.includes(goal)}
            buttonRef={(node) => {
              pills.current[index] = node;
            }}
            onToggle={(element) => {
              toggle(goal, element);
            }}
          />
        ))}
      </div>
    </StepFrame>
  );
}

function Face({
  label,
  icon,
  checked,
}: {
  readonly label: string;
  readonly icon: QuizIconName;
  readonly checked: boolean;
}): ReactNode {
  const source = quizIcon(icon);
  return (
    <>
      <picture className="quiz-option-icon" aria-hidden>
        <source type="image/avif" srcSet={`${source.avif} ${source.density}x`} />
        <img
          src={source.webp}
          srcSet={`${source.webp} ${source.density}x`}
          alt=""
          decoding="async"
        />
      </picture>
      <span className="quiz-option-text">
        <span className="quiz-option-label">{label}</span>
      </span>
      <span className={clsx('quiz-check-circle', checked && 'is-on')} aria-hidden>
        <IconCheck className="quiz-check-circle-mark" stroke={3} />
      </span>
    </>
  );
}

/** One answer: a checkbox with the options' ink wave on hover (content white). */
function CheckPill({
  label,
  icon,
  checked,
  buttonRef,
  onToggle,
}: {
  readonly label: string;
  readonly icon: QuizIconName;
  readonly checked: boolean;
  readonly buttonRef: (node: HTMLButtonElement | null) => void;
  readonly onToggle: (element: HTMLElement) => void;
}) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={(node) => {
        setHost(node);
        buttonRef(node);
      }}
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={clsx(
        'quiz-option quiz-option--short quiz-option--multi wave-host',
        checked && 'is-checked',
      )}
      onClick={(event) => {
        const element = event.currentTarget;
        act(event, () => {
          onToggle(element);
        });
      }}
      {...handlers}
    >
      <span className="wave-content">
        <Face label={label} icon={icon} checked={checked} />
      </span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        <Face label={label} icon={icon} checked={checked} />
      </WaveLayer>
    </button>
  );
}

/** «Пропустить»: a quiet text button with the privacy label's accent wave. */
function SkipButton({ onSkip }: { readonly onSkip: () => void }) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={setHost}
      type="button"
      className="quiz-privacy-label quiz-skip wave-host"
      onClick={(event) => {
        act(event, onSkip);
      }}
      {...handlers}
    >
      <span className="wave-content">{quiz.extraGoals.skip}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--accent-fill">
        {quiz.extraGoals.skip}
      </WaveLayer>
    </button>
  );
}
