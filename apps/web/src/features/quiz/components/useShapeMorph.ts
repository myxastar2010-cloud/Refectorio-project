import { animate, useMotionValue, useMotionValueEvent } from 'motion/react';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { QUIZ } from '../../../motion/tokens';

/** Corner radii: top-left, top-right, bottom-right, bottom-left (a phone's sheet has square bottom corners). */
type Radii = readonly [number, number, number, number];
type Box = { left: number; top: number; width: number; height: number; radii: Radii };

const radiiOf = (element: Element, height: number): Radii => {
  const style = getComputedStyle(element);
  const corner = (value: string) => Math.min(height / 2, Number.parseFloat(value) || 0);
  return [
    corner(style.borderTopLeftRadius),
    corner(style.borderTopRightRadius),
    corner(style.borderBottomRightRadius),
    corner(style.borderBottomLeftRadius),
  ];
};

const boxOf = (element: Element): Box => {
  const r = element.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    radii: radiiOf(element, r.height),
  };
};

/**
 * A transform-only shape morph (ТЗ §3: no layout animation, no width/height): the panel is drawn at its final size and
 * mapped onto the anchor's box (a row, the «+» oval) by translate + scale. Its corners are corrected every frame (an
 * elliptic radius R/sx / R/sy keeps them round while it stretches) and it clips its content, which is counter-scaled
 * (pinned to the shape's top centre, so it is revealed as the shape grows) and fades in from a third of the way. Over
 * its anchor the shape is see-through: it gets solid in the first steps away from it and clears in the last steps
 * back, so the anchor's own label never blinks. It opens on a spring with a small settle and closes on a short ease
 * without a spring's tail. `close(to)` runs the way back — into the anchor or into another element (the chip a new
 * item became) — and resolves when the panel sits there. `onFrame` paints extra layers with the same progress.
 */
export function useShapeMorph({
  panelRef,
  contentRef,
  anchor,
  calm,
  onFrame,
}: {
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly contentRef: RefObject<HTMLElement | null>;
  readonly anchor: HTMLElement | null;
  readonly calm: boolean;
  readonly onFrame?: (progress: number) => void;
}) {
  const progress = useMotionValue(calm || !anchor ? 1 : 0);
  const boxes = useRef<{ from: Box; to: Box } | null>(null);
  const closing = useRef(false);
  const onFrameRef = useRef(onFrame);
  useLayoutEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const paint = useCallback(
    (p: number) => {
      const panel = panelRef.current;
      const content = contentRef.current;
      const pair = boxes.current;
      if (!panel || !content) return;
      onFrameRef.current?.(pair ? p : 1);
      // At rest the panel is its own CSS shape again (no transform, its own corners). A spring's settle may pass 1
      // on the way: only the value it rests on is the end.
      if (!pair || p === 1) {
        panel.style.transform = '';
        panel.style.borderRadius = '';
        panel.style.overflow = '';
        panel.style.opacity = '';
        content.style.transform = '';
        content.style.opacity = '1';
        return;
      }
      const lerp = (a: number, b: number) => a + (b - a) * p;
      const clamp = (value: number) => Math.min(1, Math.max(0, value));
      const sx = lerp(pair.from.width / pair.to.width, 1);
      const sy = lerp(pair.from.height / pair.to.height, 1);
      const tx = lerp(pair.from.left - pair.to.left, 0);
      const ty = lerp(pair.from.top - pair.to.top, 0);
      const radii = pair.from.radii.map((from, corner) =>
        Math.max(0, lerp(from, pair.to.radii[corner] ?? 0)),
      );
      const horizontal = radii.map((radius) => `${(radius / sx).toFixed(2)}px`).join(' ');
      const vertical = radii.map((radius) => `${(radius / sy).toFixed(2)}px`).join(' ');
      panel.style.transformOrigin = '0 0';
      panel.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      panel.style.borderRadius = `${horizontal} / ${vertical}`;
      panel.style.overflow = 'clip';
      panel.style.opacity = clamp(p / QUIZ.panelSolidBy).toFixed(3);
      content.style.transformOrigin = '50% 0';
      content.style.transform = `scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)})`;
      const shown = closing.current
        ? (p - QUIZ.panelContentOutAt) / (1 - QUIZ.panelContentOutAt)
        : (p - QUIZ.panelContentAt) / QUIZ.panelContentSpan;
      content.style.opacity = clamp(shown).toFixed(3);
    },
    [panelRef, contentRef],
  );
  useMotionValueEvent(progress, 'change', paint);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !anchor || calm) {
      paint(1);
      return undefined;
    }
    // Measured in its own shape: a re-run (React's development double effects, a new anchor) must not read the
    // transform and corners a previous run painted.
    panel.style.transform = '';
    panel.style.borderRadius = '';
    boxes.current = { from: boxOf(anchor), to: boxOf(panel) };
    closing.current = false;
    paint(0);
    const controls = animate(progress, 1, QUIZ.panelOpen);
    return () => {
      controls.stop();
    };
    // Measured once when the panel opens; everything here is stable while it is open.
  }, [anchor, calm, panelRef, progress, paint]);

  const close = useCallback(
    async (to?: HTMLElement | null) => {
      const target = to ?? anchor;
      if (calm || !target || !boxes.current) return;
      // The target may have moved (a chip added above): measure it now, before flying there.
      boxes.current = { from: boxOf(target), to: boxes.current.to };
      closing.current = true;
      await animate(progress, 0, QUIZ.panelClose);
    },
    [anchor, calm, progress],
  );

  return { close };
}
