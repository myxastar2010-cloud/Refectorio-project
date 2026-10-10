import { IconPlus, IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import type { Ref } from 'react';
import { quiz } from '../../../content/quiz.ru';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { fill } from '../quizContext';
import { popChip } from './choice';
import { assignRef } from './refs';

type ChipProps = {
  readonly label: string;
  readonly selected: boolean;
  readonly calm: boolean;
  readonly onToggle: () => void;
  /** The chip a typed item became: the add panel collapses into it. */
  readonly dataKey: string;
};

/** A multi-select chip (ТЗ §8.5): outline at rest, the ink wave on hover; selected — ink fill, white text. */
export function Chip({ label, selected, calm, onToggle, dataKey }: ChipProps) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={setHost}
      type="button"
      aria-pressed={selected}
      data-chip={dataKey}
      className={clsx('quiz-chip wave-host focus-ring', selected && 'is-selected')}
      onClick={(event) => {
        const element = event.currentTarget;
        act(event, () => {
          onToggle();
          popChip(element, calm);
        });
      }}
      {...handlers}
    >
      <span className="wave-content">{label}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        {label}
      </WaveLayer>
    </button>
  );
}

/** A person's own item: always selected, with × to remove it. */
export function CustomChip({
  label,
  dataKey,
  onRemove,
  removeRef,
}: {
  readonly label: string;
  readonly dataKey: string;
  readonly onRemove: () => void;
  readonly removeRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <span className="quiz-chip quiz-chip--custom is-selected" data-chip={dataKey}>
      <span className="quiz-chip-text">{label}</span>
      <button
        ref={(node) => {
          assignRef(removeRef, node);
        }}
        type="button"
        className="quiz-chip-remove focus-ring-inverse"
        aria-label={fill(quiz.common.remove, { item: label })}
        onClick={onRemove}
      >
        <IconX aria-hidden stroke={2.5} />
      </button>
    </span>
  );
}

/** «+» in a small oval (user rule: «+» only, the words stay as its label «Добавить другое»). */
export function AddChip({
  onOpen,
  buttonRef,
}: {
  readonly onOpen: (element: HTMLButtonElement) => void;
  readonly buttonRef: Ref<HTMLButtonElement>;
}) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={(node) => {
        setHost(node);
        assignRef(buttonRef, node);
      }}
      type="button"
      className="quiz-chip quiz-chip--add wave-host focus-ring"
      aria-label={quiz.common.addOther}
      title={quiz.common.addOther}
      aria-expanded={false}
      onClick={(event) => {
        const element = event.currentTarget;
        act(event, () => {
          onOpen(element);
        });
      }}
      {...handlers}
    >
      <span className="wave-content">
        <IconPlus aria-hidden stroke={2.25} />
      </span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        <IconPlus aria-hidden stroke={2.25} />
      </WaveLayer>
    </button>
  );
}
