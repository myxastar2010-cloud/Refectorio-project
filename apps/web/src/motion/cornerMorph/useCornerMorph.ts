import { useLayoutEffect, useRef, type RefObject } from 'react';
import { DIALOG, DURATION, MORPH } from '../../motion/tokens';
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
  type Corner,
  type CornerSpring,
  type MorphStyle,
  type Quad,
} from './morph';

type Options = {
  /** The card surface at its final (dialog) size. */
  readonly surface: RefObject<HTMLElement | null>;
  /** The card picture inside it (laid out by CSS as in the open card). */
  readonly picture: RefObject<HTMLImageElement | null>;
  /** The icon's logo on top of the picture: visible while the card is small. */
  readonly logo: RefObject<HTMLElement | null>;
  /** The team icon in part 2 — where the card comes from and returns to. */
  readonly tile: RefObject<HTMLElement | null>;
  /** False once the dialog is closing. */
  readonly present: boolean;
  readonly calm: boolean;
  /** Opening: the card is open far enough (DIALOG.contentRevealAt) for its text to come in. */
  readonly onReveal: () => void;
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

/** The corner radius an element has on screen, px (the CSS of the layout decides it). */
const radiusOf = (element: Element | null) =>
  element ? Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 : 0;

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
 * transforms and radius written straight to the elements. Interruptible: a new direction starts from the current
 * corners and their velocities. Critically damped springs: the card is drawn to its place like by a magnet — no
 * bounce. The picture inside never stretches with the card: it gets the inverse of the card's transform and then a
 * plain zoom — from «the icon's square of the picture on the icon» to «the picture as in the open card».
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
    const { surface, logo, tile } = latest.current;
    const element = surface.current;
    const tileElement = tile.current;
    if (!element) return;

    if (calm || !tileElement) {
      // Reduced motion (or no icon to fly from): a short cross-fade of the whole card.
      if (present) latest.current.onReveal();
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
    // The card inherits the dialog box's radius; the icon has its own (both set by the layout CSS).
    s.radii = { tilePx: radiusOf(tileElement), dialogPx: radiusOf(element.parentElement) };
    // Where the CSS lays the picture out in the card, and the icon's square of it (box coordinates).
    const { frame: pictureFrame, icon } = pictureFraming(
      dialog.width,
      dialog.height,
      DIALOG.picture,
    );
    const tileInBox: Box = {
      left: from.left - dialog.left,
      top: from.top - dialog.top,
      width: from.width,
      height: from.height,
    };
    const logoLayer = logo.current;
    if (logoLayer) {
      logoLayer.style.width = `${icon.width.toFixed(2)}px`;
      logoLayer.style.height = `${icon.height.toFixed(2)}px`;
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
      if (!s.closing && !s.revealed && open >= DIALOG.contentRevealAt) {
        s.revealed = true;
        latest.current.onReveal();
      }
      const { radii } = s;
      const radius = radii.tilePx + (radii.dialogPx - radii.tilePx) * open;
      // The card is drawn at its final size and squeezed: the radius is pre-stretched to look round on screen.
      const { width, height } = quadSize(quad);
      const rx = radius / Math.max(0.01, width / box.width);
      const ry = radius / Math.max(0.01, height / box.height);
      element.style.borderRadius = `${rx.toFixed(2)}px / ${ry.toFixed(2)}px`;

      // Undo the card's squeeze, then zoom the picture as a whole: never distorted on screen.
      const zoom = pictureMapping({
        quad: local,
        box,
        tile: tileInBox,
        frame: pictureFrame,
        icon,
        open,
        dockedBelow: DIALOG.dockedBelow,
      });
      const inside = multiply3(invert3(mat3FromMatrix3d(card)), similarity3(zoom));
      const picture = latest.current.picture.current;
      if (picture) {
        // The picture is laid out at frame.left/top: its own transform works around that corner.
        picture.style.transform = matrixCss(
          matrix3dFromMat3(
            multiply3(
              multiply3(translate3(-pictureFrame.left, -pictureFrame.top), inside),
              translate3(pictureFrame.left, pictureFrame.top),
            ),
          ),
        );
      }
      const logoNow = latest.current.logo.current;
      if (logoNow) {
        // The logo is that same square of the picture: laid out at 0, 0 and carried onto it.
        logoNow.style.transform = matrixCss(
          matrix3dFromMat3(multiply3(inside, translate3(icon.left, icon.top))),
        );
        logoNow.style.opacity = String(1 - clamp01(open / DIALOG.logoCrossfadeEnd));
      }
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
      element.style.borderRadius = '';
      const picture = latest.current.picture.current;
      if (picture) picture.style.transform = '';
      const logoNow = latest.current.logo.current;
      if (logoNow) logoNow.style.opacity = '0';
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
      const image = latest.current.picture.current;
      const decoded = image ? image.decode().catch(() => undefined) : Promise.resolve();
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
