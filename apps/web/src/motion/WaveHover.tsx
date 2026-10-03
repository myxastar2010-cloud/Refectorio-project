import clsx from 'clsx';
import { m, type MotionValue } from 'motion/react';
import type { ReactNode } from 'react';

type WaveLayerProps = {
  readonly clipPath: MotionValue<string>;
  readonly className?: string;
  readonly children: ReactNode;
};

/** The "after-wave" copy of the content. Hidden from assistive technology: it duplicates the label. */
export function WaveLayer({ clipPath, className, children }: WaveLayerProps) {
  return (
    <m.span aria-hidden className={clsx('wave-layer', className)} style={{ clipPath }}>
      {children}
    </m.span>
  );
}
