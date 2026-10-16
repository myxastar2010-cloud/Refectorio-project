import clsx from 'clsx';
import { useRef, type KeyboardEvent } from 'react';
import { useWave } from '../../../motion/useWave';
import { WaveLayer } from '../../../motion/WaveHover';
import { popChip } from './choice';

type Item<T extends string> = { readonly value: T; readonly label: string };

function Segment({
  label,
  selected,
  tabIndex,
  calm,
  onChoose,
  onKeyDown,
  buttonRef,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly tabIndex: number;
  readonly calm: boolean;
  readonly onChoose: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly buttonRef: (node: HTMLButtonElement | null) => void;
}) {
  const { setHost, handlers, clipPath, act } = useWave<HTMLButtonElement>();
  return (
    <button
      ref={(node) => {
        setHost(node);
        buttonRef(node);
      }}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      className={clsx('quiz-segment wave-host focus-ring', selected && 'is-selected')}
      onClick={(event) => {
        const element = event.currentTarget;
        act(event, () => {
          onChoose();
          popChip(element, calm);
        });
      }}
      onKeyDown={onKeyDown}
      {...handlers}
    >
      <span className="wave-content">{label}</span>
      <WaveLayer clipPath={clipPath} className="wave-layer--ink">
        {label}
      </WaveLayer>
    </button>
  );
}

/**
 * A short inline question with a few answers (ТЗ §10: «Получаете инсулин?», the trimester, the baby's age): a radio
 * group of small pills. Arrows move and choose (ARIA radio group); nothing advances the step.
 */
export function Segmented<T extends string>({
  id,
  label,
  items,
  selected,
  calm,
  onChoose,
}: {
  readonly id: string;
  readonly label: string;
  readonly items: readonly Item<T>[];
  readonly selected: T | undefined;
  readonly calm: boolean;
  readonly onChoose: (value: T) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = items.findIndex((item) => item.value === selected);
  const focusIndex = Math.max(0, selectedIndex);

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const count = items.length;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (from + 1) % count;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (from - 1 + count) % count;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    const item = next === null ? undefined : items[next];
    if (next === null || !item) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onChoose(item.value);
  };

  return (
    <div className="quiz-followup">
      <p className="quiz-followup-label" id={id}>
        {label}
      </p>
      <div className="quiz-segments" role="radiogroup" aria-labelledby={id}>
        {items.map((item, index) => (
          <Segment
            key={item.value}
            label={item.label}
            selected={item.value === selected}
            tabIndex={index === focusIndex ? 0 : -1}
            calm={calm}
            onChoose={() => {
              onChoose(item.value);
            }}
            onKeyDown={(event) => {
              move(event, index);
            }}
            buttonRef={(node) => {
              buttons.current[index] = node;
            }}
          />
        ))}
      </div>
    </div>
  );
}
