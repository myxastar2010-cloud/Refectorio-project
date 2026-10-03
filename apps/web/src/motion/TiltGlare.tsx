import clsx from 'clsx';
import { m, useMotionTemplate, useMotionValue, useSpring, type MotionStyle } from 'motion/react';
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
 * Tilt towards the pointer with a soft glare (ТЗ 6.9), a slight lift and parallax inside: --depth-x/--depth-y move
 * the card's content further than the card (styles in components.css). Only for a fine hovering pointer and without
 * reduced motion; on touch screens it is a plain wrapper.
 */
export function TiltGlare({ maxDeg, className, disabled = false, children, ref }: Props) {
  const fine = useFinePointer();
  const calm = useCalmMotion();
  const enabled = fine && !calm && !disabled;

  const rotateX = useSpring(0, SPRING.tilt);
  const rotateY = useSpring(0, SPRING.tilt);
  const glare = useSpring(0, SPRING.tilt);
  const lift = useSpring(1, SPRING.tilt);
  const depthX = useSpring(0, SPRING.tilt);
  const depthY = useSpring(0, SPRING.tilt);
  const depthXPx = useMotionTemplate`${depthX}px`;
  const depthYPx = useMotionTemplate`${depthY}px`;
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const background = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgb(255 255 255 / ${TILT.glareOpacity}), transparent ${TILT.glareSizeRatio * 100}%)`;

  const reset = () => {
    for (const value of [rotateX, rotateY, glare, depthX, depthY]) value.jump(0);
    lift.jump(1);
  };
  useImperativeHandle(ref, () => ({ reset }));

  useEffect(() => {
    if (enabled) return;
    for (const value of [rotateX, rotateY, glare, depthX, depthY]) value.jump(0);
    lift.jump(1);
  }, [enabled, rotateX, rotateY, glare, depthX, depthY, lift]);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    rotateY.set((px - 0.5) * 2 * maxDeg);
    rotateX.set(-(py - 0.5) * 2 * maxDeg);
    depthX.set((px - 0.5) * 2 * TILT.depthPx);
    depthY.set((py - 0.5) * 2 * TILT.depthPx);
    lift.set(1 + TILT.liftScale);
    glareX.set(px * 100);
    glareY.set(py * 100);
    glare.set(1);
  };

  const onPointerLeave = () => {
    for (const value of [rotateX, rotateY, glare, depthX, depthY]) value.set(0);
    lift.set(1);
  };

  return (
    <m.div
      className={clsx('tilt', className)}
      style={
        {
          rotateX,
          rotateY,
          scale: lift,
          transformPerspective: TILT.perspectivePx,
          // Motion animates CSS variables too; its style type only lists regular properties.
          '--depth-x': depthXPx,
          '--depth-y': depthYPx,
        } as MotionStyle
      }
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {children}
      <m.span aria-hidden className="tilt-glare" style={{ opacity: glare, background }} />
    </m.div>
  );
}
