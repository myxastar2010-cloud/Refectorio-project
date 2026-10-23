import clsx from 'clsx';
import { animate, m, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { DURATION, EASE_OUT_SOFT, FINALE } from '../../../motion/tokens';
import type { CoreRenderer } from './coreGl';
import { glWanted } from './gl';

type Props = {
  /** The hand-off has arrived: grow from the dot into the core. */
  readonly grown: boolean;
  /** Changes on every caption: a ripple. */
  readonly pulse: number;
  /** The dot's diameter in CSS px (the progress bar's height) and the core box's size. */
  readonly dotPx: number;
  readonly sizePx: number;
  readonly calm: boolean;
  /** The honest line is up: the core stops moving (WCAG 2.2.2). */
  readonly paused: boolean;
};

/**
 * The core (ТЗ §12.2): the WebGL2 metaball (lazy chunk coreGl) or, without WebGL2, with saveData or reduced motion,
 * the CSS fallback — the same accent drop as a gradient with a soft opacity pulse. Both start as the bar's red dot.
 */
export function Core({ grown, pulse, dotPx, sizePx, calm, paused }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<CoreRenderer | null>(null);
  const [wanted] = useState(() => glWanted(calm));
  const [mode, setMode] = useState<'pending' | 'gl' | 'css'>(wanted ? 'pending' : 'css');
  const intro = useMotionValue(calm ? 1 : 0);
  const cssScale = useTransform(intro, (v) => dotPx / sizePx + (1 - dotPx / sizePx) * v);

  useEffect(() => {
    if (!wanted) return undefined;
    let cancelled = false;
    // Read through a function: after the await the cleanup may have run (TypeScript would narrow a plain read away).
    const isCancelled = () => cancelled;
    void import('./coreGl')
      .then(async ({ createCoreRenderer }) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        const created = await createCoreRenderer(canvas, {
          dprMax: FINALE.dprMax,
          onLost: () => {
            setMode('css');
          },
        });
        if (isCancelled()) {
          created?.dispose();
          return;
        }
        renderer.current = created;
        setMode(created ? 'gl' : 'css');
      })
      .catch(() => {
        if (!cancelled) setMode('css');
      });
    return () => {
      cancelled = true;
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [wanted]);

  // The dot's radius in the shader's units (shares of the canvas half-size).
  useEffect(() => {
    renderer.current?.setDot(dotPx / sizePx);
  }, [dotPx, sizePx, mode]);

  useEffect(() => {
    const unsubscribe = intro.on('change', (v) => renderer.current?.setIntro(v));
    renderer.current?.setIntro(intro.get());
    return unsubscribe;
  }, [intro, mode]);

  useEffect(() => {
    if (!grown || calm) return undefined;
    const controls = animate(intro, 1, { duration: FINALE.introMs / 1000, ease: EASE_OUT_SOFT });
    return () => {
      controls.stop();
    };
  }, [grown, calm, intro]);

  useEffect(() => {
    if (pulse > 0) renderer.current?.pulse();
  }, [pulse]);

  useEffect(() => {
    renderer.current?.setPaused(paused);
  }, [paused, mode]);

  return (
    <div className="quiz-core" style={{ width: sizePx, height: sizePx }} aria-hidden>
      {mode === 'css' ? (
        <m.div
          className={clsx('quiz-core-css', calm && 'is-calm', paused && 'is-paused')}
          style={{ scale: cssScale }}
          initial={calm ? { opacity: 0 } : false}
          animate={{ opacity: 1, transition: { duration: DURATION.fade } }}
        />
      ) : (
        <canvas
          ref={canvasRef}
          className="quiz-core-canvas"
          data-ready={mode === 'gl' || undefined}
        />
      )}
    </div>
  );
}
