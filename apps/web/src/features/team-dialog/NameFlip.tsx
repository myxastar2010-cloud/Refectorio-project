import { animate, type AnimationPlaybackControls } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type PointerEvent } from 'react';
import { useCalmMotion } from '../../motion/hooks';
import { NAME_FLIP } from '../../motion/tokens';

type Props = {
  readonly lines: readonly string[];
  readonly translation: readonly string[];
};

type Point = { readonly x: number; readonly y: number };

/**
 * A letter, the way (unit vector) the wave from the cursor pushes it, how far it is from the cursor, and where it
 * is right now (a wave may be turned around half-way).
 */
type Push = {
  readonly letter: HTMLElement;
  readonly ux: number;
  readonly uy: number;
  readonly distance: number;
  readonly transform: string;
  readonly opacity: number;
};

const lettersOf = (layer: HTMLElement | null) => [
  ...(layer?.querySelectorAll<HTMLElement>('.flip-char') ?? []),
];

const REST = 'translate(0px, 0px) scale(1)';
const shift = (ux: number, uy: number, px: number, scale: number) =>
  `translate(${(ux * px).toFixed(2)}px, ${(uy * px).toFixed(2)}px) scale(${scale.toFixed(4)})`;

/**
 * The computed transform (`none` or a `matrix(…)` of a translate and a uniform scale) written in the same form as
 * the targets. Every keyframe must share that form: Motion reads a bare `none` as «scale(0)», which collapsed the
 * letters into dots.
 */
function current(transform: string): string {
  const values = /matrix\(([^)]+)\)/.exec(transform)?.[1]?.split(',').map(Number);
  if (!values || values.length !== 6 || values.some((value) => !Number.isFinite(value)))
    return REST;
  const [scale = 1, , , , x = 0, y = 0] = values;
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
}

/** Measures every letter before any animation starts: one layout for the whole wave. */
function measure(letters: readonly HTMLElement[], point: Point): Push[] {
  return letters.map((letter) => {
    const rect = letter.getBoundingClientRect();
    const style = getComputedStyle(letter);
    const dx = rect.left + rect.width / 2 - point.x;
    const dy = rect.top + rect.height / 2 - point.y;
    const distance = Math.hypot(dx, dy);
    return {
      letter,
      ux: distance < 1 ? 0 : dx / distance,
      uy: distance < 1 ? -1 : dy / distance,
      distance,
      transform: current(style.transform),
      opacity: Number(style.opacity),
    };
  });
}

/**
 * The team name that «translates» itself (an easter egg of the team card). The mouse coming onto the name sends a
 * light wave from the cursor: every letter drifts a few pixels away from it and fades — the nearest first — and the
 * letters of «Современное Проявление» settle into place behind the wave. Leaving sends the wave back from the point
 * where the cursor left. On touch screens a tap does the same. Screen readers always get the original name (it is
 * also the dialog's accessible name).
 */
export function NameFlip({ lines, translation }: Props) {
  const calm = useCalmMotion();
  const originalRef = useRef<HTMLSpanElement>(null);
  const translationRef = useRef<HTMLSpanElement>(null);
  const translated = useRef(false);
  const running = useRef<AnimationPlaybackControls[]>([]);

  // The translation waits invisible in the same place (set before the first paint).
  useLayoutEffect(() => {
    for (const letter of lettersOf(translationRef.current)) letter.style.opacity = '0';
  }, []);

  useEffect(
    () => () => {
      for (const motion of running.current) motion.stop();
    },
    [],
  );

  const flip = (toTranslation: boolean, point: Point) => {
    if (translated.current === toTranslation) return;
    translated.current = toTranslation;
    const outgoing = lettersOf(toTranslation ? originalRef.current : translationRef.current);
    const incoming = lettersOf(toTranslation ? translationRef.current : originalRef.current);

    if (calm) {
      for (const motion of running.current) motion.stop();
      running.current = [];
      for (const letter of outgoing) letter.style.opacity = '0';
      for (const letter of incoming) Object.assign(letter.style, { transform: REST, opacity: '1' });
      return;
    }

    // Where every letter is now (also mid-way through a wave that is being turned around), then the old wave stops.
    const outs = measure(outgoing, point);
    const ins = measure(incoming, point);
    for (const motion of running.current) motion.stop();
    running.current = [];
    const reach = Math.max(1, ...[...outs, ...ins].map(({ distance }) => distance));
    // Nearer letters drift further, the farthest about half as far.
    const strength = (distance: number) => 1 - 0.5 * (distance / reach);
    const wave = (distance: number) => distance / NAME_FLIP.waveSpeedPxS;

    for (const { letter, ux, uy, distance, transform, opacity } of outs) {
      const away = shift(ux, uy, NAME_FLIP.pushPx * strength(distance), NAME_FLIP.outScale);
      running.current.push(
        animate(
          letter,
          { transform: [transform, away], opacity: [opacity, 0] },
          { duration: NAME_FLIP.outS, delay: wave(distance), ease: NAME_FLIP.outEase },
        ),
      );
    }

    for (const { letter, ux, uy, distance, transform, opacity } of ins) {
      // A letter that is fully gone starts a little behind the wave; a half-way one simply turns around.
      const behind = -NAME_FLIP.pushPx * NAME_FLIP.inFromShare * strength(distance);
      const from = opacity < 0.05 ? shift(ux, uy, behind, NAME_FLIP.inScale) : transform;
      running.current.push(
        animate(
          letter,
          { transform: [from, REST], opacity: [opacity, 1] },
          {
            duration: NAME_FLIP.inS,
            delay: wave(distance) + NAME_FLIP.inLagS,
            ease: NAME_FLIP.inEase,
          },
        ),
      );
    }
  };

  const at = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
  const byMouse = (event: PointerEvent) => event.pointerType === 'mouse';

  const layer = (text: readonly string[], ref: typeof originalRef) => (
    <span ref={ref} className="name-flip-text">
      {text.map((line) => (
        <span key={line} className="name-flip-line">
          {Array.from(line).map((char, index) => (
            <span key={`${String(index)}${char}`} className="flip-char">
              {char}
            </span>
          ))}
        </span>
      ))}
    </span>
  );

  return (
    <>
      <span className="visually-hidden">{lines.join(' ')}</span>
      <span
        aria-hidden
        className="name-flip"
        onPointerEnter={(event) => {
          if (byMouse(event)) flip(true, at(event));
        }}
        onPointerLeave={(event) => {
          if (byMouse(event)) flip(false, at(event));
        }}
        onPointerUp={(event) => {
          if (!byMouse(event)) flip(!translated.current, at(event));
        }}
      >
        {layer(lines, originalRef)}
        {layer(translation, translationRef)}
      </span>
    </>
  );
}
