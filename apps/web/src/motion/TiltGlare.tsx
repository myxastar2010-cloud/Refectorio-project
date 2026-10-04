import clsx from 'clsx';
import { m, useSpring } from 'motion/react';
import { useEffect, useImperativeHandle, type PointerEvent, type ReactNode, type Ref } from 'react';
import { useCalmMotion, useFinePointer } from './hooks';
import { SPRING, TILT } from './tokens';

export type TiltHandle = { reset: () => void };

type Props = {
  readonly maxDeg: number;
  readonly className?: string;
  /** A soft light that follows the pointer (only the feature cards of part 1 have it). */
  readonly glare?: boolean;
  /** Freezes the tilt at zero (e.g. right before the team card expands). */
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly ref?: Ref<TiltHandle>;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Tilt towards the pointer (ТЗ 6.9): the card turns as one piece and rises a little. With `glare`, a soft round
 * light glides after the pointer — a smooth gradient moved by a transform (no repaints); it is brightest when the
 * card is turned to the light at the top left and faint on the opposite side. Only for a fine hovering pointer and
 * without reduced motion; on touch screens it is a plain wrapper.
 */
export function TiltGlare({
  maxDeg,
  className,
  glare = false,
  disabled = false,
  children,
  ref,
}: Props) {
  const fine = useFinePointer();
  const calm = useCalmMotion();
  const enabled = fine && !calm && !disabled;

  const rotateX = useSpring(0, SPRING.tilt);
  const rotateY = useSpring(0, SPRING.tilt);
  const lift = useSpring(1, SPRING.tilt);
  const shine = useSpring(0, SPRING.glare);
  const lightX = useSpring(0, SPRING.glare);
  const lightY = useSpring(0, SPRING.glare);

  const settle = (jump: boolean) => {
    for (const value of [rotateX, rotateY, shine]) {
      if (jump) value.jump(0);
      else value.set(0);
    }
    if (jump) lift.jump(1);
    else lift.set(1);
  };

  useImperativeHandle(ref, () => ({
    reset: () => {
      settle(true);
    },
  }));

  useEffect(() => {
    if (enabled) return;
    for (const value of [rotateX, rotateY, shine]) value.jump(0);
    lift.jump(1);
  }, [enabled, rotateX, rotateY, shine, lift]);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    rotateY.set((px - 0.5) * 2 * maxDeg);
    rotateX.set(-(py - 0.5) * 2 * maxDeg);
    lift.set(1 + TILT.liftScale);
    if (!glare) return;
    // A first move places the light under the pointer at once; then it glides after it.
    if (shine.get() < 0.01) {
      lightX.jump(x);
      lightY.jump(y);
    }
    lightX.set(x);
    lightY.set(y);
    // Light from the top left: bright at that corner, a gentle sheen elsewhere.
    const towardsLight = clamp01((TILT.lightReach - (px + py)) / TILT.lightReach);
    shine.set(TILT.glareFloor + (1 - TILT.glareFloor) * towardsLight);
  };

  return (
    <m.div
      className={clsx('tilt', glare && 'tilt--glare', className)}
      style={{ rotateX, rotateY, scale: lift, transformPerspective: TILT.perspectivePx }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        settle(false);
      }}
    >
      {children}
      {glare && (
        <m.span
          aria-hidden
          className="tilt-glare"
          style={{ x: lightX, y: lightY, opacity: shine }}
        />
      )}
    </m.div>
  );
}
