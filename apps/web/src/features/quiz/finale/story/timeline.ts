/**
 * The story's timeline (§7.4): scenes one after another with a transformation between each two; the last scene
 * loops forever. Pure and unit-tested — the canvas only asks it where it is.
 */
export type TimedScene = {
  readonly durationS: number;
  readonly cues: readonly (readonly [number, number])[];
};

export type Step =
  | { readonly kind: 'scene'; readonly scene: number; readonly start: number; readonly end: number }
  | {
      readonly kind: 'morph';
      readonly from: number;
      readonly to: number;
      readonly start: number;
      readonly end: number;
    };

export type Timeline = {
  readonly steps: readonly Step[];
  /** When the last scene starts (from there on it loops). */
  readonly loopStart: number;
  readonly loopS: number;
  /** Caption changes: [time, caption index], sorted. */
  readonly cues: readonly (readonly [number, number])[];
};

export function buildTimeline(scenes: readonly TimedScene[], morphS: number): Timeline {
  const steps: Step[] = [];
  const cues: [number, number][] = [];
  let at = 0;
  scenes.forEach((scene, i) => {
    if (i > 0) {
      steps.push({ kind: 'morph', from: i - 1, to: i, start: at, end: at + morphS });
      at += morphS;
    }
    for (const [offset, caption] of scene.cues) cues.push([at + offset, caption]);
    steps.push({ kind: 'scene', scene: i, start: at, end: at + scene.durationS });
    at += scene.durationS;
  });
  const last = steps.at(-1);
  return {
    steps,
    loopStart: last?.start ?? 0,
    loopS: last ? last.end - last.start : 1,
    cues: cues.sort((a, b) => a[0] - b[0]),
  };
}

/** The step at time `t` and the time inside it (the last scene repeats). */
export function stepAt(timeline: Timeline, t: number): { step: Step; local: number } {
  const { steps, loopStart, loopS } = timeline;
  if (t >= loopStart) {
    const step = steps.at(-1);
    if (step) return { step, local: (t - loopStart) % loopS };
  }
  for (const step of steps) {
    if (t < step.end) return { step, local: Math.max(0, t - step.start) };
  }
  const step = steps.at(-1) ?? { kind: 'scene', scene: 0, start: 0, end: 1 };
  return { step, local: 0 };
}

/** The caption shown at `t` (−1 before the first). */
export function captionAt(timeline: Timeline, t: number): number {
  let caption = -1;
  for (const [at, index] of timeline.cues) {
    if (at > t) break;
    caption = index;
  }
  return caption;
}

/** When a scene starts (a test hook fast-forwards there). */
export const sceneStart = (timeline: Timeline, scene: number): number =>
  timeline.steps.find((step) => step.kind === 'scene' && step.scene === scene)?.start ?? 0;
