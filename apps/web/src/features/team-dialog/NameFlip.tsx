import { animate, type AnimationPlaybackControls } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type PointerEvent } from 'react';
import { useCalmMotion } from '../../motion/hooks';
import { NAME_FLIP } from '../../motion/tokens';

type Props = {
  readonly lines: readonly string[];
  readonly translation: readonly string[];
};

type Point = { readonly x: number; readonly y: number };

const lettersOf = (layer: HTMLElement | null) => [
  ...(layer?.querySelectorAll<HTMLElement>('.flip-char') ?? []),
];

/** Where a letter is and which way (unit vector) a push from `point` sends it. */
function awayFrom(letter: HTMLElement, point: Point) {
  const rect = letter.getBoundingClientRect();
  const dx = rect.left + rect.width / 2 - point.x;
  const dy = rect.top + rect.height / 2 - point.y;
  const distance = Math.hypot(dx, dy);
  return distance < 1
    ? { ux: 0, uy: -1, distance }
    : { ux: dx / distance, uy: dy / distance, distance };
}

const restStyle = { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', filter: 'blur(0px)' };

/**
 * The team name that «translates» itself (an easter egg of the team card). The mouse coming onto the name sends a
 * blur wave from the cursor: every letter is pushed away from it, blurs and fades — the nearest first, the farthest
 * last — and the letters of «Современное Проявление» fly into place behind the wave with a light bounce. Leaving
 * sends the wave back from the point where the cursor left. On touch screens a tap does the same. Screen readers
 * always get the original name (it is also the dialog's accessible name).
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
    for (const motion of running.current) motion.stop();
    running.current = [];
    const outgoing = lettersOf(toTranslation ? originalRef.current : translationRef.current);
    const incoming = lettersOf(toTranslation ? translationRef.current : originalRef.current);

    if (calm) {
      for (const letter of outgoing) letter.style.opacity = '0';
      for (const letter of incoming) Object.assign(letter.style, restStyle, { opacity: '1' });
      return;
    }

    const outs = outgoing.map((letter) => ({ letter, ...awayFrom(letter, point) }));
    const ins = incoming.map((letter) => ({ letter, ...awayFrom(letter, point) }));
    const reach = Math.max(1, ...[...outs, ...ins].map(({ distance }) => distance));
    // Nearer letters get a stronger push, a far one about half of it.
    const strength = (distance: number) => 1 - 0.5 * (distance / reach);
    const wave = (distance: number) => distance / NAME_FLIP.waveSpeedPxS;

    for (const { letter, ux, uy, distance } of outs) {
      const push = NAME_FLIP.pushPx * strength(distance);
      running.current.push(
        animate(
          letter,
          {
            transform: `translate(${(ux * push).toFixed(1)}px, ${(uy * push).toFixed(1)}px) rotate(${(ux * NAME_FLIP.spinDeg).toFixed(1)}deg) scale(${String(NAME_FLIP.outScale)})`,
            filter: `blur(${String(NAME_FLIP.blurPx)}px)`,
            opacity: 0,
          },
          { duration: NAME_FLIP.outS, delay: wave(distance), ease: NAME_FLIP.outEase },
        ),
      );
    }

    for (const { letter, ux, uy, distance } of ins) {
      // A letter that is fully gone starts from where the wave would have thrown it; a half-way one turns around.
      if (Number(getComputedStyle(letter).opacity) < 0.05) {
        const push = NAME_FLIP.pushPx * NAME_FLIP.inFromShare * strength(distance);
        letter.style.transform = `translate(${(ux * push).toFixed(1)}px, ${(uy * push).toFixed(1)}px) rotate(${(-ux * NAME_FLIP.spinDeg).toFixed(1)}deg) scale(${String(NAME_FLIP.inScale)})`;
        letter.style.filter = `blur(${String(NAME_FLIP.blurPx)}px)`;
      }
      const delay = wave(distance) + NAME_FLIP.inLagS;
      running.current.push(
        animate(
          letter,
          { transform: restStyle.transform },
          { type: 'spring', visualDuration: NAME_FLIP.inS, bounce: NAME_FLIP.inBounce, delay },
        ),
        animate(
          letter,
          { filter: restStyle.filter, opacity: 1 },
          { duration: NAME_FLIP.inS * 0.8, delay, ease: 'easeOut' },
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
