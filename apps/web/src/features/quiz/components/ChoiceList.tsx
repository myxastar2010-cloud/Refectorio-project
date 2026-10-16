import clsx from 'clsx';
import { useIsPresent } from 'motion/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { QuizIconName } from '../quizIcons';
import { useQuiz } from '../quizContext';
import { bounceThen, digitIndex } from './choice';
import { OptionPill } from './OptionPill';

export type ChoiceItem<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly icon?: QuizIconName;
  readonly disabled?: boolean;
  readonly tag?: string;
};

type Props<T extends string> = {
  readonly items: readonly ChoiceItem<T>[];
  readonly selected: T | undefined;
  readonly variant: 'options' | 'wide' | 'widest' | 'short' | 'yesno';
  readonly labelledBy: string;
  /** Store the answer; the list then plays the bounce and calls `onDone`. */
  readonly onChoose: (value: T) => void;
  readonly onDone: () => void;
  readonly className?: string;
};

/**
 * A single-choice list (radiogroup with a roving focus): arrows move, Space/Enter or a click chooses, digits 1–9
 * choose the n-th answer (ТЗ §7.8). One choice per visit: a second click while the step leaves does nothing.
 */
export function ChoiceList<T extends string>({
  items,
  selected,
  variant,
  labelledBy,
  onChoose,
  onDone,
  className,
}: Props<T>) {
  const { calm, state } = useQuiz();
  const present = useIsPresent();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = useRef(false);
  // Back during the bounce: the step is leaving, its pending «next» must not move the quiz forward again.
  const presentRef = useRef(present);
  useEffect(() => {
    presentRef.current = present;
  }, [present]);
  const selectedIndex = items.findIndex((item) => item.value === selected);
  const [focusIndex, setFocusIndex] = useState(() =>
    selectedIndex >= 0
      ? selectedIndex
      : Math.max(
          0,
          items.findIndex((item) => !item.disabled),
        ),
  );

  const choose = (index: number, element: HTMLElement | null) => {
    const item = items[index];
    if (!item || item.disabled || chosen.current || !present) return;
    chosen.current = true;
    onChoose(item.value);
    const target = element ?? buttons.current[index];
    const done = () => {
      if (presentRef.current) onDone();
    };
    if (target) void bounceThen(target, calm, done);
    else done();
  };

  // Digits pick an answer while this step is the current one and nothing covers it.
  useEffect(() => {
    if (!present) return undefined;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (state.notices.length > 0 || document.querySelector('[aria-modal="true"]')) return;
      const index = digitIndex(event);
      if (index === null || index >= items.length) return;
      event.preventDefault();
      buttons.current[index]?.focus();
      choose(index, null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);
    const position = enabled.indexOf(from);
    let next: number | undefined;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      next = enabled[(position + 1) % enabled.length];
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = enabled[(position - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled.at(-1);
    if (next === undefined) return;
    event.preventDefault();
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={clsx('quiz-choices', `quiz-choices--${variant}`, className)}
    >
      {items.map((item, index) => (
        <OptionPill
          key={item.value}
          label={item.label}
          {...(item.description ? { description: item.description } : {})}
          {...(item.icon ? { icon: item.icon } : {})}
          {...(item.tag ? { tag: item.tag } : {})}
          radio={variant === 'yesno'}
          selected={item.value === selected}
          disabled={item.disabled ?? false}
          variant={variant}
          tabIndex={index === focusIndex ? 0 : -1}
          buttonRef={(node) => {
            buttons.current[index] = node;
          }}
          onChoose={(element) => {
            setFocusIndex(index);
            choose(index, element);
          }}
          onKeyDown={(event) => {
            move(event, index);
          }}
        />
      ))}
    </div>
  );
}
