import { animate, m, type AnimationPlaybackControls } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { quiz } from '../../../content/quiz.ru';
import { DURATION, EASE_IN_OUT, FINALE } from '../../../motion/tokens';
import { glWanted } from './gl';
import type { Point } from './Handoff';
import type { RevealRenderer } from './revealGl';

/** The front's thickness relative to the screen's diagonal. */
const FRONT_SHARE = 0.09;
/** Radius of the CSS fallback ring at scale 1 (mirrors .quiz-reveal-ring). */
const RING_RADIUS_PX = 100;

/**
 * The reveal wave (ТЗ §12.5; built now for stage 3, shown with `?reveal=demo`): a volumetric wave runs from the core
 * to every edge of the screen and reveals what is behind it — here the placeholder «Меню появится в задании 3». The
 * content is uncovered by a circle that runs just inside the WebGL front and settles from scale 1.03. Without WebGL2
 * the same circle has a soft ring of its own; reduced motion — a cross-fade.
 */
export function RevealWave({ origin, calm }: { readonly origin: Point; readonly calm: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [gl] = useState(() => glWanted(calm));

  useEffect(() => {
    const content = contentRef.current;
    if (!content || calm) return undefined;
    let renderer: RevealRenderer | null = null;
    let cancelled = false;
    let wave: AnimationPlaybackControls | null = null;
    // A function, not the flag itself: TypeScript would keep its narrowing across the awaits.
    const stopped = () => cancelled;
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
      await controls;
      if (stopped()) return;
      content.style.clipPath = 'none';
      content.style.transform = 'none';
      renderer?.dispose();
      renderer = null;
      if (canvasRef.current) canvasRef.current.style.display = 'none';
      if (ringRef.current) ringRef.current.style.display = 'none';
    };
    void run();
    return () => {
      cancelled = true;
      wave?.stop();
      renderer?.dispose();
      renderer = null;
    };
  }, [origin, calm, gl]);

  const host = document.querySelector<HTMLElement>('.quiz') ?? document.body;
  return createPortal(
    <div className="quiz-reveal">
      <m.div
        ref={contentRef}
        className="quiz-reveal-content"
        initial={calm ? { opacity: 0 } : false}
        animate={{ opacity: 1, transition: { duration: DURATION.fade } }}
      >
        <p className="quiz-reveal-text">{quiz.finale.revealPlaceholder}</p>
      </m.div>
      {calm ? null : gl ? (
        <canvas ref={canvasRef} className="quiz-reveal-canvas" aria-hidden />
      ) : (
        <div ref={ringRef} className="quiz-reveal-ring" aria-hidden />
      )}
    </div>,
    host,
  );
}
