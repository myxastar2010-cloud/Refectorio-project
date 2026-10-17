import { useLayoutEffect, useRef, type RefObject } from 'react';
import { DIALOG, DURATION, MORPH } from '../tokens';
import {
  atRest,
  boxCorners,
  cornerSprings,
  invert3,
  mat3FromMatrix3d,
  matrix3dFromMat3,
  matrixCss,
  multiply3,
  openness,
  pictureFraming,
  pictureMapping,
  quadMatrix,
  quadSize,
  similarity3,
  stepCorner,
  translate3,
  type Box,
  type CardPicture,
  type Corner,
  type CornerSpring,
  type MorphStyle,
  type Quad,
} from './morph';

/**
 * A picture laid on the surface that must never stretch with it (the team card's star): it gets the inverse of the
 * surface's transform and a uniform zoom from «its square on the anchor» to «as in the open card».
 */
export type MorphPicture = {
  /** The picture inside the surface (laid out by CSS as in the open card). */
  readonly image: RefObject<HTMLImageElement | null>;
  /** The anchor's own logo on top of the picture: visible while the surface is small. */
  readonly logo: RefObject<HTMLElement | null>;
  readonly spec: CardPicture;
  /** Up to this openness the picture stays docked on the anchor. */
  readonly dockedBelow: number;
  /** The logo fades out over this first share of the way. */
  readonly logoCrossfadeEnd: number;
};

type Options = {
  /** The surface at its final size (its parent box carries the final corner radius in CSS). */
  readonly surface: RefObject<HTMLElement | null>;
  /** Where the surface comes from and returns to; read again at every change of direction (it may move). */
  readonly anchor: RefObject<HTMLElement | null>;
  readonly picture?: MorphPicture;
  /** False once the surface is closing. */
  readonly present: boolean;
  readonly calm: boolean;
  /** Opening: the shape is open far enough for its content to come in (default DIALOG.contentRevealAt). */
  readonly revealAt?: number;
  readonly onReveal: () => void;
  /** The surface has landed back on the anchor: the anchor can be shown again. */
  readonly onLanded: () => void;
  /** Safe to unmount. */
  readonly onDone: () => void;
  /** Every drawn frame: how open the shape is (0 — anchor, 1 — open). */
  readonly onFrame?: (openness: number) => void;
  /**
   * An anchor that does not look like the surface (a text label): the surface fades in over this first share of the
   * way and fades out as it lands, so it grows out of the label and melts back into it.
   */
  readonly fadeBelow?: number;
};

const boxOf = (rect: DOMRect): Box => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
});

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The corner radius an element has on screen, px (the CSS decides it; a pill's 9999px is its half height). */
function radiusOf(element: Element | null, box?: Box) {
  if (!element) return 0;
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  return box ? Math.min(radius, box.width / 2, box.height / 2) : radius;
}

/** The element behind a ref (a plain read: the options object itself is never written to). */
const elementOf = <T extends HTMLElement>(ref: RefObject<T | null> | undefined): T | null =>
  ref?.current ?? null;

/** The layout box of an element, ignoring its own transform. */
function layoutBox(element: HTMLElement): Box {
  const previous = element.style.transform;
  element.style.transform = 'none';
  const box = boxOf(element.getBoundingClientRect());
  element.style.transform = previous;
  return box;
}

/**
 * Opens and closes a surface by the corner morph (see morph.ts) — the team card, the project card and the quiz's
 * panels: one requestAnimationFrame loop while it moves, transforms and radius written straight to the elements.
 * Interruptible: a new direction starts from the current corners and their velocities. Critically damped springs:
 * the surface is drawn to its place like by a magnet — no bounce; closing is 1.5× faster (MORPH.close).
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
    radii: { tilePx: number; dialogPx: number };
    revealed: boolean;
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
    radii: { tilePx: 0, dialogPx: 0 },
    revealed: false,
    startedAt: 0,
    last: 0,
    raf: 0,
    closing: false,
  });

  const { present, calm } = options;

  useLayoutEffect(() => {
    const s = state.current;
    const { surface, anchor, picture: pictureSpec } = latest.current;
    const element = surface.current;
    const tileElement = anchor.current;
    if (!element) return;
    const revealAt = latest.current.revealAt ?? DIALOG.contentRevealAt;

    if (calm || !tileElement?.isConnected) {
      // Reduced motion (or no anchor to fly from): a short cross-fade of the whole surface.
      if (present) latest.current.onReveal();
      const logo = elementOf(pictureSpec?.logo);
      if (logo) logo.style.opacity = '0';
      latest.current.onFrame?.(present ? 1 : 0);
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
    // The surface inherits its box's radius; the anchor has its own (both set by the layout CSS).
    s.radii = { tilePx: radiusOf(tileElement, from), dialogPx: radiusOf(element.parentElement) };
    // Where the CSS lays the picture out in the card, and the anchor's square of it (box coordinates).
    const framing = pictureSpec
      ? pictureFraming(dialog.width, dialog.height, pictureSpec.spec)
      : null;
    const tileInBox: Box = {
      left: from.left - dialog.left,
      top: from.top - dialog.top,
      width: from.width,
      height: from.height,
    };
    const logoLayer = elementOf(pictureSpec?.logo);
    if (logoLayer && framing) {
      logoLayer.style.width = `${framing.icon.width.toFixed(2)}px`;
      logoLayer.style.height = `${framing.icon.height.toFixed(2)}px`;
    }
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
      const card = quadMatrix(local, box.width, box.height);
      element.style.transform = matrixCss(card);
      const open = openness(quad, fromBox, box);
      if (!s.closing && !s.revealed && open >= revealAt) {
        s.revealed = true;
        latest.current.onReveal();
      }
      latest.current.onFrame?.(open);
      const fadeBelow = latest.current.fadeBelow;
      if (fadeBelow) element.style.opacity = clamp01(open / fadeBelow).toFixed(3);
      const { radii } = s;
      const radius = radii.tilePx + (radii.dialogPx - radii.tilePx) * open;
      // The surface is drawn at its final size and squeezed: the radius is pre-stretched to look round on screen.
      const { width, height } = quadSize(quad);
      const rx = radius / Math.max(0.01, width / box.width);
      const ry = radius / Math.max(0.01, height / box.height);
      element.style.borderRadius = `${rx.toFixed(2)}px / ${ry.toFixed(2)}px`;

      const spec = latest.current.picture;
      if (!spec || !framing) return;
      // Undo the card's squeeze, then zoom the picture as a whole: never distorted on screen.
      const zoom = pictureMapping({
        quad: local,
        box,
        tile: tileInBox,
        frame: framing.frame,
        icon: framing.icon,
        open,
        dockedBelow: spec.dockedBelow,
      });
      const inside = multiply3(invert3(mat3FromMatrix3d(card)), similarity3(zoom));
      const image = elementOf(spec.image);
      if (image) {
        // The picture is laid out at frame.left/top: its own transform works around that corner.
        image.style.transform = matrixCss(
          matrix3dFromMat3(
            multiply3(
              multiply3(translate3(-framing.frame.left, -framing.frame.top), inside),
              translate3(framing.frame.left, framing.frame.top),
            ),
          ),
        );
      }
      const logoNow = elementOf(spec.logo);
      if (logoNow) {
        // The logo is that same square of the picture: laid out at 0, 0 and carried onto it.
        logoNow.style.transform = matrixCss(
          matrix3dFromMat3(multiply3(inside, translate3(framing.icon.left, framing.icon.top))),
        );
        logoNow.style.opacity = String(1 - clamp01(open / spec.logoCrossfadeEnd));
      }
    };

    const finish = () => {
      s.raf = 0;
      if (s.closing) {
        latest.current.onLanded();
        // One more frame with the surface exactly over the anchor, then the anchor alone.
        requestAnimationFrame(() => {
          latest.current.onDone();
        });
        return;
      }
      s.corners = null;
      element.style.transform = '';
      element.style.borderRadius = '';
      element.style.opacity = '';
      const spec = latest.current.picture;
      const image = elementOf(spec?.image);
      if (image) image.style.transform = '';
      const logo = elementOf(spec?.logo);
      if (logo) logo.style.opacity = '0';
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
    const image = elementOf(pictureSpec?.image);
    if (fromRest && image) {
      // Opening from rest with a picture: the card is first painted on the anchor (with its picture decoded), then
      // it flies — the first heavy frame never stalls the motion.
      const decoded = image.decode().catch(() => undefined);
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
