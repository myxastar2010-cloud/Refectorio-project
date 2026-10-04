import { animate, type AnimationPlaybackControls } from 'motion/react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Lines } from '../../components/Lines';
import { useCalmMotion } from '../../motion/hooks';
import { NAME_FLIP } from '../../motion/tokens';

type Props = {
  readonly lines: readonly string[];
  readonly translation: readonly string[];
};

/**
 * The team name that «translates» itself: with the pointer over it, a push with a blur swaps it for the Russian
 * version at the peak of the blur; when the pointer leaves, it flips back. On touch screens a tap toggles it.
 * Screen readers always get the original name (it is also the dialog's accessible name).
 */
export function NameFlip({ lines, translation }: Props) {
  const calm = useCalmMotion();
  const [translated, setTranslated] = useState(false);
  const flipRef = useRef<HTMLSpanElement>(null);
  const motion = useRef<AnimationPlaybackControls | null>(null);
  const swap = useRef(0);
  const target = useRef(false);

  useEffect(
    () => () => {
      motion.current?.stop();
      window.clearTimeout(swap.current);
    },
    [],
  );

  const flipTo = (next: boolean) => {
    if (target.current === next) return;
    target.current = next;
    const element = flipRef.current;
    motion.current?.stop();
    window.clearTimeout(swap.current);
    if (calm || !element) {
      setTranslated(next);
      return;
    }
    const peak = NAME_FLIP.swapAt;
    motion.current = animate(
      element,
      {
        transform: ['scale(1)', `scale(${NAME_FLIP.pushScale})`, 'scale(1)'],
        filter: ['blur(0px)', `blur(${NAME_FLIP.blurPx}px)`, 'blur(0px)'],
        opacity: [1, 0.55, 1],
      },
      { duration: NAME_FLIP.durationS, times: [0, peak, 1], ease: ['easeIn', 'easeOut'] },
    );
    swap.current = window.setTimeout(
      () => {
        setTranslated(next);
      },
      NAME_FLIP.durationS * peak * 1000,
    );
  };

  const byMouse = (event: PointerEvent) => event.pointerType === 'mouse';

  return (
    <>
      <span className="visually-hidden">{lines.join(' ')}</span>
      <span
        ref={flipRef}
        aria-hidden
        className="name-flip"
        onPointerEnter={(event) => {
          if (byMouse(event)) flipTo(true);
        }}
        onPointerLeave={(event) => {
          if (byMouse(event)) flipTo(false);
        }}
        onPointerUp={(event) => {
          if (!byMouse(event)) flipTo(!target.current);
        }}
      >
        <Lines lines={translated ? translation : lines} />
      </span>
    </>
  );
}
