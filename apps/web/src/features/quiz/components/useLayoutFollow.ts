import { animate, useMotionValue, type MotionValue } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { QUIZ } from '../../../motion/tokens';

/**
 * Content under a block that changes height (the chip cloud ↔ the add panel, a new line of chips) glides to its new
 * place instead of jumping: FLIP on translateY with the panel's spring. `offsetTop` ignores transforms, so a glide
 * that is still running continues from where it is. Bind the result to `style={{ y }}` of an `m` element.
 */
export function useLayoutFollow(
  ref: RefObject<HTMLElement | null>,
  calm: boolean,
): MotionValue<number> {
  const y = useMotionValue(0);
  const last = useRef<number | null>(null);

  // After every render of the owner: did the content move?
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const top = element.offsetTop;
    const previous = last.current;
    last.current = top;
    if (previous === null || previous === top || calm) return;
    y.jump(y.get() + previous - top);
    void animate(y, 0, { type: 'spring', ...QUIZ.panelSpring });
  });

  // A resize moves it too, but that is not a change to animate later.
  useEffect(() => {
    const onResize = () => {
      if (ref.current) last.current = ref.current.offsetTop;
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [ref]);

  return y;
}
