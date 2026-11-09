import { animate, m, useMotionValue, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { EASE_OUT_EXPO, MENU } from '../../../motion/tokens';

type Props = {
  readonly value: number;
  /** Must be stable (a module function): the shown text follows the motion value without React renders. */
  readonly format: (n: number) => string;
  readonly calm: boolean;
  readonly className?: string;
};

/** A number that counts to its new value (ТЗ фаза 4 §14: count-ups on the eaten toggle). Reduced motion: it jumps. */
export function CountUp({ value, format, calm, className }: Props) {
  const shown = useMotionValue(value);
  const text = useTransform(shown, format);
  useEffect(() => {
    if (calm) {
      shown.jump(value);
      return undefined;
    }
    const controls = animate(shown, value, { duration: MENU.countS, ease: EASE_OUT_EXPO });
    return () => {
      controls.stop();
    };
  }, [value, calm, shown]);
  return <m.span className={className}>{text}</m.span>;
}
