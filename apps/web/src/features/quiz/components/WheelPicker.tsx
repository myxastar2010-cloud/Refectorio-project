import { animate, useMotionValue, type AnimationPlaybackControls } from 'motion/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { quiz } from '../../../content/quiz.ru';
import { useCalmMotion } from '../../../motion/hooks';
import { WHEEL } from '../../../motion/tokens';
import { fill, formatNumber } from '../quizContext';
import {
  clamp,
  drum,
  flingTarget,
  indexOf,
  itemCount,
  parseTyped,
  releaseVelocity,
  rubberBand,
  valueAt,
  wheelSteps,
  type WheelRange,
} from './wheelPhysics';

export type WheelProps = {
  readonly range: WheelRange;
  readonly value: number;
  readonly onChange: (value: number) => void;
  /** Unit after the centre value («лет», «см», «кг»), may depend on the value (plural forms). */
  readonly unit: (value: number) => string;
  /** Accessible name («Возраст»). */
  readonly label: string;
  /** Decimals allowed when the value is typed (weights: 1). */
  readonly decimals: number;
  /** The person pushed against an end of the range (the panel explains why). */
  readonly onLimit?: (edge: 'min' | 'max') => void;
  /** Enter on the wheel = «Готово». */
  readonly onCommit: () => void;
};

/** DOM slots around the centre: enough for 7 visible rows plus the ones rolling in. */
const SLOTS = 11;
const HALF = Math.floor(SLOTS / 2);

/**
 * The wheel picker (ТЗ §8.3): an Apple-Watch-like drum of values. Drag or flick (momentum and a spring snap), mouse
 * wheel (one notch — one value), keys (↑ → D +1, ↓ ← A −1, PageUp/PageDown ±10, Home/End), a click on the centre
 * value to type it. All motion lives in one motion value and direct style writes — no React render per frame.
 */
export function WheelPicker({
  range,
  value,
  onChange,
  unit,
  label,
  decimals,
  onLimit,
  onCommit,
}: WheelProps) {
  const calm = useCalmMotion();
  const count = itemCount(range);
  const offset = useMotionValue(indexOf(range, value));
  const rootRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const itemPx = useRef(48);
  const animation = useRef<AnimationPlaybackControls | null>(null);
  /** Where a running snap is heading: quick keys and wheel notches add up from there, not from the drum's position. */
  const heading = useRef<number | null>(null);
  const drag = useRef<{
    startY: number;
    startOffset: number;
    samples: { t: number; offset: number }[];
    moved: boolean;
  } | null>(null);
  const wheelCarry = useRef(0);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The typed field is open (a blur after Enter or Esc must not commit or cancel a second time).
  const typingOpen = useRef(false);
  const [shownValue, setShownValue] = useState(value);
  // An outside change of the value (a typed number, a reset) is shown at once (React's «adjust state while rendering»).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setShownValue(value);
  }

  // Paint the drum for the current offset (transform and opacity only).
  const paint = useCallback(
    (o: number) => {
      const centre = Math.round(o);
      for (let k = -HALF; k <= HALF; k += 1) {
        const slot = slotRefs.current[k + HALF];
        if (!slot) continue;
        const index = centre + k;
        if (index < 0 || index >= count) {
          slot.style.opacity = '0';
          continue;
        }
        const d = drum(index - o, itemPx.current);
        const text = formatNumber(valueAt(range, index));
        if (slot.textContent !== text) slot.textContent = text;
        slot.style.opacity = d.opacity.toFixed(3);
        slot.style.transform = `translateY(${d.y.toFixed(2)}px) scale(${d.scale.toFixed(4)}) scaleY(${d.scaleY.toFixed(4)})`;
      }
    },
    [count, range],
  );

  useLayoutEffect(() => {
    const first = slotRefs.current[HALF];
    if (first) itemPx.current = first.getBoundingClientRect().height || itemPx.current;
    paint(offset.get());
    return offset.on('change', paint);
  }, [offset, paint]);

  // …and moves the drum there.
  useEffect(() => {
    const target = indexOf(range, value);
    if (Math.abs(offset.get() - target) > 0.001 && !drag.current && !animation.current)
      offset.set(target);
  }, [value, range, offset]);

  const settleTo = useCallback(
    (index: number, velocity = 0) => {
      animation.current?.stop();
      const target = clamp(index, 0, count - 1);
      const next = valueAt(range, target);
      setShownValue(next);
      onChange(next);
      if (calm) {
        offset.set(target);
        animation.current = null;
        heading.current = null;
        return;
      }
      const controls = animate(offset, target, { type: 'spring', ...WHEEL.snap, velocity });
      animation.current = controls;
      heading.current = target;
      void controls.then(() => {
        if (animation.current !== controls) return;
        animation.current = null;
        heading.current = null;
      });
    },
    [calm, count, offset, onChange, range],
  );

  const stepBy = useCallback(
    (steps: number) => {
      const current = heading.current ?? Math.round(offset.get());
      const target = current + steps;
      if (target < 0) onLimit?.('min');
      if (target > count - 1) onLimit?.('max');
      settleTo(target);
    },
    [count, offset, onLimit, settleTo],
  );

  // Wheel: a non-passive listener (it must stop the page from scrolling).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const result = wheelSteps(
        event.deltaY,
        event.deltaMode,
        wheelCarry.current,
        itemPx.current / 2,
      );
      wheelCarry.current = result.carry;
      if (result.steps !== 0) stepBy(result.steps);
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      root.removeEventListener('wheel', onWheel);
    };
  }, [stepBy]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (typing || event.button !== 0) return;
    animation.current?.stop();
    animation.current = null;
    heading.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startY: event.clientY,
      startOffset: offset.get(),
      samples: [{ t: event.timeStamp, offset: offset.get() }],
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dy = event.clientY - state.startY;
    if (Math.abs(dy) > 4) state.moved = true;
    const next = rubberBand(state.startOffset - dy / itemPx.current, count);
    offset.set(next);
    state.samples.push({ t: event.timeStamp, offset: next });
    if (state.samples.length > 12) state.samples.shift();
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (!state.moved) {
      // A tap: on the centre — type the value; above or below it — go there.
      const rect = event.currentTarget.getBoundingClientRect();
      const rows = Math.round((event.clientY - (rect.top + rect.height / 2)) / itemPx.current);
      if (rows === 0) {
        setTyped(formatNumber(shownValue));
        setMessage(null);
        setTyping(true);
      } else stepBy(rows);
      return;
    }
    const velocity = releaseVelocity(state.samples);
    const target = flingTarget(offset.get(), velocity, count, calm);
    if (offset.get() < 0) onLimit?.('min');
    if (offset.get() > count - 1) onLimit?.('max');
    settleTo(target, velocity);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (typing) return;
    const key = event.key;
    const plus =
      key === 'ArrowUp' ||
      key === 'ArrowRight' ||
      key === 'd' ||
      key === 'D' ||
      key === 'в' ||
      key === 'В';
    const minus =
      key === 'ArrowDown' ||
      key === 'ArrowLeft' ||
      key === 'a' ||
      key === 'A' ||
      key === 'ф' ||
      key === 'Ф';
    if (plus || minus) {
      event.preventDefault();
      stepBy(plus ? 1 : -1);
    } else if (key === 'PageUp' || key === 'PageDown') {
      event.preventDefault();
      stepBy(key === 'PageUp' ? 10 : -10);
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      settleTo(key === 'Home' ? 0 : count - 1);
    } else if (key === 'Enter') {
      event.preventDefault();
      onCommit();
    } else if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      setTyped(key);
      setMessage(null);
      typingOpen.current = true;
      setTyping(true);
    }
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!typing || !input) return;
    // The caret after the first digit: the next digits add to it (selecting it would replace it: «70» → «0»).
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, [typing]);

  /** `refocus` false: the field lost focus on its own (iOS «Done», a click on «Готово») — focus stays there. */
  const finishTyping = (commit: boolean, refocus = true) => {
    const focusWheel = () => {
      if (refocus) rootRef.current?.focus();
    };
    if (!commit) {
      typingOpen.current = false;
      setTyping(false);
      focusWheel();
      return;
    }
    const parsed = parseTyped(typed, range, decimals);
    if (!parsed) {
      setMessage(quiz.goalSetup.typedInvalid);
      if (!refocus) {
        typingOpen.current = false;
        setTyping(false);
      }
      return;
    }
    typingOpen.current = false;
    setTyping(false);
    setMessage(
      parsed.clamped
        ? fill(quiz.goalSetup.typedClamped, {
            value: `${formatNumber(parsed.value)} ${unit(parsed.value)}`,
          })
        : null,
    );
    if (parsed.clamped) onLimit?.(parsed.value <= range.min ? 'min' : 'max');
    animation.current?.stop();
    animation.current = null;
    heading.current = null;
    offset.set(indexOf(range, parsed.value));
    setShownValue(parsed.value);
    onChange(parsed.value);
    focusWheel();
  };

  const valueText = `${formatNumber(shownValue)} ${unit(shownValue)}`;
  return (
    <div className="quiz-wheel-wrap">
      <div
        ref={rootRef}
        className="quiz-wheel focus-ring"
        data-autofocus
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={range.min}
        aria-valuemax={range.max}
        aria-valuenow={shownValue}
        aria-valuetext={valueText}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="quiz-wheel-band" aria-hidden />
        <div className="quiz-wheel-items" aria-hidden>
          {Array.from({ length: SLOTS }, (_, i) => (
            <span
              key={i}
              ref={(node) => {
                slotRefs.current[i] = node;
              }}
              className="quiz-wheel-item"
            />
          ))}
        </div>
        <span className="quiz-wheel-unit" aria-hidden>
          {unit(shownValue)}
        </span>
        {typing ? (
          <input
            ref={inputRef}
            className="quiz-wheel-input"
            data-own-escape
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            aria-label={label}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                finishTyping(true);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                finishTyping(false);
              }
            }}
            onBlur={() => {
              // Leaving the field keeps what was typed; an empty field leaves the wheel as it was.
              if (!typingOpen.current) return;
              if (typed.trim() === '') finishTyping(false, false);
              else finishTyping(true, false);
            }}
          />
        ) : null}
      </div>
      <p className="quiz-wheel-message" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
