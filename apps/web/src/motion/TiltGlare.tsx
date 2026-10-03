import clsx from 'clsx';
import { m, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useImperativeHandle, type PointerEvent, type ReactNode, type Ref } from 'react';
import { useCalmMotion, useFinePointer } from './hooks';
import { SPRING, TILT } from './tokens';

export type TiltHandle = { reset: () => void };

type Props = {
  readonly maxDeg: number;
  readonly className?: string;
  /** Freezes the tilt at zero (e.g. right before the team card expands). */
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly ref?: Ref<TiltHandle>;
};

/**
 * Tilt towards the pointer with a soft glare (ТЗ 6.9). Only for a fine hovering pointer and without
 * reduced motion; on touch screens it is a plain wrapper.
 */
export function TiltGlare({ maxDeg, className, disabled = false, children, ref }: Props) {
  const fine = useFinePointer();
  const calm = useCalmMotion();
  const enabled = fine && !calm && !disabled;

  const rotateX = useSpring(0, SPRING.tilt);
  const rotateY = useSpring(0, SPRING.tilt);
  const glare = useSpring(0, SPRING.tilt);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const background = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / ${TILT.glareOpacity}), transparent ${TILT.glareSizeRatio * 100}%)`;

  const reset = () => {
    rotateX.jump(0);
    rotateY.jump(0);
    glare.jump(0);
  };
  useImperativeHandle(ref, () => ({ reset }));

  useEffect(() => {
    if (!enabled) {
      rotateX.jump(0);
      rotateY.jump(0);
      glare.jump(0);
    }
  }, [enabled, rotateX, rotateY, glare]);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 2 * maxDeg);
    rotateX.set(-(py - 0.5) * 2 * maxDeg);
    glareX.set(px * 100);
    glareY.set(py * 100);
    glare.set(1);
  };

  const onPointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
    glare.set(0);
  };

  return (
    <m.div
      className={clsx('tilt', className)}
      style={{ rotateX, rotateY, transformPerspective: TILT.perspectivePx }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}
      <m.span aria-hidden className="tilt-glare" style={{ opacity: glare, background }} />
    </m.div>
  );
}
