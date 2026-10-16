import clsx from 'clsx';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { assignRef } from './refs';
import { quizIcon, type QuizIconName } from '../quizIcons';

type Props = {
  readonly label: string;
  readonly description?: string;
  readonly icon?: QuizIconName;
  /** yes/no pills: a radio circle instead of an icon (as designed). */
  readonly radio?: boolean;
  readonly selected: boolean;
  readonly disabled?: boolean;
  /** A small tag over the label («Похоже, вам подходит», «Недоступно»). */
  readonly tag?: string;
  readonly variant: 'options' | 'wide' | 'widest' | 'short' | 'yesno';
  readonly tabIndex: number;
  readonly onChoose: (element: HTMLElement) => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly buttonRef?: Ref<HTMLButtonElement>;
};

function Face({
  label,
  description,
  icon,
  radio,
  selected,
  tag,
}: Pick<Props, 'label' | 'description' | 'icon' | 'radio' | 'selected' | 'tag'>): ReactNode {
  const source = icon ? quizIcon(icon) : null;
  return (
    <>
      {radio ? <span className={clsx('quiz-radio', selected && 'is-on')} aria-hidden /> : null}
      {source ? (
        <picture className="quiz-option-icon" aria-hidden>
          <source type="image/avif" srcSet={`${source.avif} ${source.density}x`} />
          <img
            src={source.webp}
            srcSet={`${source.webp} ${source.density}x`}
            alt=""
            decoding="async"
          />
        </picture>
      ) : null}
      <span className="quiz-option-text">
        {tag ? <span className="quiz-option-tag">{tag}</span> : null}
        <span className="quiz-option-label">{label}</span>
        {description ? <span className="quiz-option-desc">{description}</span> : null}
      </span>
    </>
  );
}

/**
 * A single-choice answer (ТЗ §7.7, §8.1): the landing's ink wave on hover (content white), focus ring, a press;
 * chosen — the finished ink fill. The step reacts to `onChoose` (bounce, then the next step).
 */
export function OptionPill(props: Props) {
  const { selected, disabled, variant, onChoose, onKeyDown, tabIndex, buttonRef } = props;
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={(node) => {
        setHost(node);
        assignRef(buttonRef, node);
      }}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      className={clsx(
        'quiz-option wave-host focus-ring',
        `quiz-option--${variant}`,
        selected && 'is-selected',
        disabled && 'is-disabled',
      )}
      onClick={(event) => {
        if (disabled) return;
        const element = event.currentTarget;
        act(event, () => {
          onChoose(element);
        });
      }}
      onKeyDown={onKeyDown}
      {...(disabled ? {} : handlers)}
    >
      <span className="wave-content">
        <Face {...props} />
      </span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        <Face {...props} />
      </WaveLayer>
    </button>
  );
}
