import type { TasteAnswer } from '@refectorio/contracts';
import { IconCheck, IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import { m, useTransform, type MotionValue } from 'motion/react';
import type { ReactNode } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { TINDER } from '../../../motion/tokens';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';

export type Swell = {
  readonly like: MotionValue<number>;
  readonly dislike: MotionValue<number>;
  readonly skip: MotionValue<number>;
};

const KEYS: Record<TasteAnswer, string> = {
  dislike: 'A ArrowLeft',
  skip: 'S',
  like: 'D ArrowRight',
};

function GameButton({
  answer,
  label,
  children,
  swell,
  disabled,
  onAnswer,
}: {
  readonly answer: TasteAnswer;
  readonly label: string;
  readonly children: ReactNode;
  readonly swell: MotionValue<number>;
  readonly disabled: boolean;
  readonly onAnswer: (answer: TasteAnswer) => void;
}) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  const scale = useTransform(swell, (v) => 1 + v * TINDER.buttonSwell);
  const round = answer !== 'skip';
  return (
    <m.button
      ref={setHost}
      type="button"
      className={clsx('quiz-game-button wave-host', `quiz-game-button--${answer}`)}
      style={{ scale }}
      aria-label={round ? label : undefined}
      title={round ? label : undefined}
      aria-keyshortcuts={KEYS[answer]}
      disabled={disabled}
      onClick={(event) => {
        act(event, () => {
          onAnswer(answer);
        });
      }}
      {...handlers}
    >
      <span className="wave-content">{children}</span>
      <WaveLayer clipPath={clipPath} className={`wave-layer--game-${answer}`}>
        {children}
      </WaveLayer>
    </m.button>
  );
}

/**
 * ✕ «Не нравится» (accent circle) · «Пропустить» (muted pill) · ✓ «Нравится» (green circle) — the design's controls;
 * the matching one swells as the card is dragged towards it. Keys: A/← · S · D/→ (TasteStep; ↓/↑ open the info).
 */
export function GameControls({
  swell,
  disabled,
  onAnswer,
}: {
  readonly swell: Swell;
  readonly disabled: boolean;
  readonly onAnswer: (answer: TasteAnswer) => void;
}) {
  return (
    <div className="quiz-game-controls">
      <GameButton
        answer="dislike"
        label={quiz.taste.dislike}
        swell={swell.dislike}
        disabled={disabled}
        onAnswer={onAnswer}
      >
        <IconX aria-hidden stroke={2.5} />
      </GameButton>
      <GameButton
        answer="skip"
        label={quiz.taste.skip}
        swell={swell.skip}
        disabled={disabled}
        onAnswer={onAnswer}
      >
        {quiz.taste.skip}
      </GameButton>
      <GameButton
        answer="like"
        label={quiz.taste.like}
        swell={swell.like}
        disabled={disabled}
        onAnswer={onAnswer}
      >
        <IconCheck aria-hidden stroke={2.5} />
      </GameButton>
    </div>
  );
}
