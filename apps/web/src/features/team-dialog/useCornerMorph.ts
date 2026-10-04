import { useLayoutEffect, useRef, type RefObject } from 'react';
import { DIALOG, DURATION, MORPH } from '../../motion/tokens';
import {
  atRest,
  boxCorners,
  cornerSprings,
  matrixCss,
  openness,
  quadMatrix,
  quadSize,
  stepCorner,
  type Box,
  type Corner,
  type CornerSpring,
  type MorphStyle,
  type Quad,
} from './morph';

type Options = {
  /** The card surface at its final (dialog) size. */
  readonly surface: RefObject<HTMLElement | null>;
  /** The logo layer inside it: visible while the card is small. */
  readonly logo: RefObject<HTMLElement | null>;
  /** The team icon in part 2 — where the card comes from and returns to. */
  readonly tile: RefObject<HTMLElement | null>;
  /** False once the dialog is closing. */
  readonly present: boolean;
  readonly calm: boolean;
  /** Visual corner radii on screen, px. */
  readonly radii: { readonly tilePx: number; readonly dialogPx: number };
  /** The card has landed back on the icon: the icon can be shown again. */
  readonly onLanded: () => void;
  /** Safe to unmount the dialog. */
  readonly onDone: () => void;
};

const boxOf = (rect: DOMRect): Box => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The layout box of an element, ignoring its own transform. */
function layoutBox(element: HTMLElement): Box {
  const previous = element.style.transform;
  element.style.transform = 'none';
  const box = boxOf(element.getBoundingClientRect());
  element.style.transform = previous;
  return box;
}

/**
 * Opens and closes the team card by the corner morph (see morph.ts): one requestAnimationFrame loop while it moves,
 * transform and radius written straight to the element. Interruptible: a new direction starts from the current
 * corners and their velocities. Critically damped springs: the card is drawn to its place like by a magnet —
 * no bounce.
 */
export function useCornerMorph(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const state = useRef<{
    corners: Corner[] | null;
    targets: Quad | null;
    springs: CornerSpring[];
    dialog: Box | null;
    tile: Box | null;
    startedAt: number;
    last: number;
    raf: number;
    closing: boolean;
  }>({
    corners: null,
    targets: null,
    springs: [],
    dialog: null,
    tile: null,
    startedAt: 0,
    last: 0,
    raf: 0,
    closing: false,
  });

  const { present, calm } = options;

  useLayoutEffect(() => {
    const s = state.current;
    const { surface, logo, tile } = latest.current;
    const element = surface.current;
    const tileElement = tile.current;
    if (!element) return;

    if (calm || !tileElement) {
      // Reduced motion (or no icon to fly from): a short cross-fade of the whole card.
      if (logo.current) logo.current.style.opacity = '0';
      const fade = element.animate(
        present ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        { duration: DURATION.fade * 1000, fill: 'forwards' },
      );
      if (!present) {
        fade.onfinish = () => {
          latest.current.onLanded();
          latest.current.onDone();
        };
      }
      return () => {
        fade.onfinish = null;
      };
    }

    const dialog = layoutBox(element);
    const from = boxOf(tileElement.getBoundingClientRect());
    s.dialog = dialog;
    s.tile = from;
    const current: Quad = s.corners
      ? (s.corners.map(({ x, y }) => ({ x, y })) as unknown as Quad)
      : present
        ? boxCorners(from)
        : boxCorners(dialog);
    s.corners ??= current.map(({ x, y }) => ({ x, y, vx: 0, vy: 0 }));
    s.targets = present ? boxCorners(dialog) : boxCorners(from);
    const style: MorphStyle = present ? MORPH.open : MORPH.close;
    s.springs = cornerSprings(current, s.targets, style);
    const fromRest =
      present &&
      !s.closing &&
      current.every((point, i) => {
        const start = boxCorners(from)[i];
        return start !== undefined && point.x === start.x && point.y === start.y;
      });
    s.closing = !present;

    const draw = () => {
      const corners = s.corners;
      const box = s.dialog;
      const fromBox = s.tile;
      if (!corners || !box || !fromBox) return;
      const quad = corners.map(({ x, y }) => ({ x, y })) as unknown as Quad;
      const local = quad.map(({ x, y }) => ({
        x: x - box.left,
        y: y - box.top,
      })) as unknown as Quad;
      element.style.transform = matrixCss(quadMatrix(local, box.width, box.height));
      const open = openness(quad, fromBox, box);
      const { radii } = latest.current;
      const radius = radii.tilePx + (radii.dialogPx - radii.tilePx) * open;
      // The card is drawn at its final size and squeezed: the radius is pre-stretched to look round on screen.
      const { width, height } = quadSize(quad);
      const rx = radius / Math.max(0.01, width / box.width);
      const ry = radius / Math.max(0.01, height / box.height);
      element.style.borderRadius = `${rx.toFixed(2)}px / ${ry.toFixed(2)}px`;
      const logoLayer = latest.current.logo.current;
      if (logoLayer) logoLayer.style.opacity = String(1 - clamp01(open / DIALOG.logoCrossfadeEnd));
    };

    const finish = () => {
      s.raf = 0;
      if (s.closing) {
        latest.current.onLanded();
        // One more frame with the card exactly over the icon, then the icon alone.
        requestAnimationFrame(() => {
          latest.current.onDone();
        });
        return;
      }
      s.corners = null;
      element.style.transform = '';
      element.style.borderRadius = `${latest.current.radii.dialogPx}px`;
      const logoLayer = latest.current.logo.current;
      if (logoLayer) logoLayer.style.opacity = '0';
    };

    const frame = (now: number) => {
      const dt = Math.min((now - s.last) / 1000, MORPH.maxStepS);
      s.last = now;
      const elapsed = (now - s.startedAt) / 1000;
      const corners = s.corners;
      const targets = s.targets;
      if (!corners || !targets) return;
      let resting = true;
      for (let i = 0; i < corners.length; i += 1) {
        const corner = corners[i];
        const spring = s.springs[i];
        const target = targets[i];
        if (!corner || !spring || !target) continue;
        const next = elapsed >= spring.delayS ? stepCorner(corner, target, spring, dt) : corner;
        corners[i] = next;
        if (!atRest(next, target, MORPH.restPx)) resting = false;
      }
      draw();
      if (resting) {
        corners.forEach((_, i) => {
          const target = targets[i];
          if (target) corners[i] = { x: target.x, y: target.y, vx: 0, vy: 0 };
        });
        draw();
        finish();
        return;
      }
      s.raf = requestAnimationFrame(frame);
    };

    const begin = () => {
      s.startedAt = performance.now();
      s.last = s.startedAt;
      s.raf = requestAnimationFrame(frame);
    };

    element.style.transformOrigin = '0 0';
    draw();
    cancelAnimationFrame(s.raf);
    let cancelled = false;
    if (fromRest) {
      // Opening from rest: the card is first painted on the icon (with its picture decoded), then it flies —
      // the first heavy frame never stalls the motion.
      const picture = element.querySelector('img');
      const decoded = picture ? picture.decode().catch(() => undefined) : Promise.resolve();
      const timeout = new Promise((resolve) => setTimeout(resolve, MORPH.startWaitMs));
      void Promise.race([decoded, timeout]).then(() => {
        requestAnimationFrame(() => {
          if (!cancelled) begin();
        });
      });
    } else {
      begin();
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [present, calm]);
}
