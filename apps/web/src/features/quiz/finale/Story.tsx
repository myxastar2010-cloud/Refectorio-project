import { useCallback, useEffect, useRef } from 'react';
import type { RawStory } from './story/data';
import type { StoryHandle } from './story/story';

type Props = {
  /** The hand-off dot has arrived: the story starts from it. */
  readonly started: boolean;
  readonly sizePx: number;
  /** The dot's diameter (CSS px): the first drawing grows from it. */
  readonly dotPx: number;
  readonly calm: boolean;
  /** The honest line is up: the story stands still (WCAG 2.2.2). */
  readonly paused: boolean;
  readonly seed: number;
  readonly onCaption: (index: number) => void;
  /** The menu is ready: the story ends in a pulse (at the end of the pot, or from the dots at once). */
  readonly ready: boolean;
  /** The pulse is at its peak: the reveal wave starts from the centre. */
  readonly onPulse: () => void;
  /** Test builds: start at this scene. */
  readonly startAt: string | null;
};

/**
 * The generation story (stage 3, §7; ADR 0012): line drawings on a Canvas 2D that turn into one another through clouds
 * of points — notebook, planet, … — then dots forever. The engine and the drawings are a lazy chunk of their own.
 * Decorative: the captions are the live region.
 */
export function Story({
  started,
  sizePx,
  dotPx,
  calm,
  paused,
  seed,
  onCaption,
  ready,
  onPulse,
  startAt,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<StoryHandle | null>(null);
  const captionRef = useRef(onCaption);
  useEffect(() => {
    captionRef.current = onCaption;
  }, [onCaption]);
  const pausedRef = useRef(paused);
  const pulseRef = useRef(onPulse);
  useEffect(() => {
    pulseRef.current = onPulse;
  }, [onPulse]);
  const readyRef = useRef(ready);
  /**
   * The story's chunk did not arrive (offline, a deploy replaced the files): no story, but the menu is still
   * uncovered — the pulse comes as soon as the menu is ready (stage-5 code audit, P1 raised to P0).
   */
  const storyFailed = useRef(false);
  const pulsed = useRef(false);
  const pulseOnce = useCallback(() => {
    if (pulsed.current) return;
    pulsed.current = true;
    pulseRef.current();
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    let cancelled = false;
    const isCancelled = () => cancelled;
    // A new attempt (a resize re-creates the story): only its own outcome counts. A pulse already given stays given.
    storyFailed.current = false;
    Promise.all([import('./story/story'), import('./story/story-data.json')])
      .then(([module, data]) => {
        const canvas = canvasRef.current;
        if (isCancelled() || !canvas) return;
        const styles = getComputedStyle(canvas);
        const token = (name: string) => styles.getPropertyValue(name).trim();
        handle.current = module.createStory(data.default as unknown as RawStory, {
          canvas,
          sizePx,
          dotPx,
          calm,
          seed,
          palette: [token('--color-ink'), token('--color-ink-muted'), token('--color-accent')],
          onCaption: (index) => {
            captionRef.current(index);
          },
          onPulse: pulseOnce,
          startAt:
            __TEST_HOOKS__ && startAt
              ? module.STORY_SCENES.find((id) => id === startAt)
              : undefined,
        });
        handle.current?.setPaused(pausedRef.current);
        if (readyRef.current) handle.current?.finish();
      })
      // Also an error inside the story's own start: no story, the menu still comes.
      .catch(() => {
        if (isCancelled()) return;
        storyFailed.current = true;
        if (readyRef.current) pulseOnce();
      });
    return () => {
      cancelled = true;
      handle.current?.dispose();
      handle.current = null;
    };
  }, [started, sizePx, dotPx, calm, seed, startAt, pulseOnce]);

  useEffect(() => {
    pausedRef.current = paused;
    handle.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    readyRef.current = ready;
    if (!ready) return;
    if (storyFailed.current) pulseOnce();
    else handle.current?.finish();
  }, [ready, pulseOnce]);

  return (
    <div className="quiz-story" style={{ width: sizePx, height: sizePx }} aria-hidden>
      <canvas ref={canvasRef} className="quiz-story-canvas" />
    </div>
  );
}
