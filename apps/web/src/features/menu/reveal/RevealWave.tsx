import { animate, type AnimationPlaybackControls } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { EASE_IN_OUT, FINALE, MENU } from '../../../motion/tokens';
import { glWanted } from './gl';
import type { RevealRenderer } from './revealGl';

export type Point = { readonly x: number; readonly y: number };

/** The front's thickness relative to the screen's diagonal. */
const FRONT_SHARE = 0.09;
/** Radius of the CSS fallback ring at scale 1 (mirrors .reveal-ring). */
const RING_RADIUS_PX = 100;

type Props = {
  /** Where the wave starts (the story's pulse); null — no wave, the content is simply there. */
  readonly origin: Point | null;
  readonly calm: boolean;
  /** The content is fully uncovered. */
  readonly onDone: () => void;
  readonly className: string;
  readonly children: ReactNode;
};

/**
 * The reveal wave (ТЗ этап 3 §12.5, этап 4 фаза 4 §1): a volumetric wave runs from the story's pulse to every edge of
 * the screen and uncovers the menu page rendered underneath — by a circle that runs just inside the WebGL front and
 * settles from scale 1.03. Without WebGL2 the circle has a soft ring of its own; reduced motion — a 300 ms cross-fade.
 * The content element stays the same before, during and after the wave: the page never remounts.
 */
export function RevealWave({ origin, calm, onDone, className, children }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [gl] = useState(() => glWanted(calm));
  // The wave is set when the page mounts (it comes in from the quiz) and never again: the front lives until the end.
  const [running, setRunning] = useState(origin !== null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  // A layout effect: the first clip is set before the page is painted, so the menu never flashes uncovered.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !origin) return undefined;
    let renderer: RevealRenderer | null = null;
    let cancelled = false;
    let wave: AnimationPlaybackControls | null = null;
    // A function, not the flag itself: TypeScript would keep its narrowing across the awaits.
    const stopped = () => cancelled;
    const finish = () => {
      content.style.clipPath = '';
      content.style.transform = '';
      content.style.opacity = '';
      renderer?.dispose();
      renderer = null;
      setRunning(false);
      doneRef.current();
    };
    if (calm) {
      content.style.opacity = '0';
      wave = animate(content, { opacity: [0, 1] }, { duration: MENU.calmRevealMs / 1000 });
      void wave.finished.then(() => {
        if (!stopped()) finish();
      });
      return () => {
        cancelled = true;
        wave?.stop();
      };
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    const far = Math.max(
      Math.hypot(origin.x, origin.y),
      Math.hypot(width - origin.x, origin.y),
      Math.hypot(origin.x, height - origin.y),
      Math.hypot(width - origin.x, height - origin.y),
    );
    const front = Math.hypot(width, height) * FRONT_SHARE;
    const paint = (t: number) => {
      const radius = t * (far + front * 1.5);
      const inner = Math.max(0, radius - front * 0.35);
      content.style.clipPath = `circle(${inner.toFixed(1)}px at ${origin.x.toFixed(1)}px ${origin.y.toFixed(1)}px)`;
      content.style.transform = `scale(${(1.03 - 0.03 * t).toFixed(4)})`;
      const fade = Math.min(1, t * 6) * (1 - Math.max(0, (t - 0.82) / 0.18));
      if (renderer) renderer.draw(origin, radius, front, fade);
      const ring = ringRef.current;
      if (ring) {
        // A 200 px circle (CSS) scaled to the front's radius.
        ring.style.transform = `translate(${origin.x.toFixed(1)}px, ${origin.y.toFixed(1)}px) scale(${(radius / RING_RADIUS_PX).toFixed(4)})`;
        ring.style.opacity = fade.toFixed(3);
      }
    };
    paint(0);
    const run = async () => {
      const canvas = canvasRef.current;
      if (gl && canvas) {
        const { createRevealRenderer } = await import('./revealGl');
        if (stopped()) return;
        renderer = createRevealRenderer(canvas);
      }
      const controls = animate(0, 1, {
        duration: FINALE.revealMs / 1000,
        ease: EASE_IN_OUT,
        onUpdate: paint,
      });
      wave = controls;
      await controls.finished;
      if (!stopped()) finish();
    };
    void run();
    return () => {
      cancelled = true;
      wave?.stop();
      renderer?.dispose();
      renderer = null;
    };
  }, [origin, calm, gl]);

  return (
    <>
      <div ref={contentRef} className={className}>
        {children}
      </div>
      {running && !calm ? (
        gl ? (
          <canvas ref={canvasRef} className="reveal-canvas" aria-hidden />
        ) : (
          <div ref={ringRef} className="reveal-ring" aria-hidden />
        )
      ) : null}
    </>
  );
}
