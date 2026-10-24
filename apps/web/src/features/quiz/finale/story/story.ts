import { FINALE, STORY } from '../../../../motion/tokens';
import { decodeScene, type RawStory, type SceneData } from './data';
import { clamp01, type Palette } from './draw';
import { drawMorph, planMorph, type MorphPlan } from './morph';
import { craneScene, dotsScene, potScene, robotScene } from './laterScenes';
import { notebookScene, planetScene, type SceneContext, type SceneScript } from './scenes';
import { buildTimeline, captionAt, sceneStart, stepAt, type Timeline } from './timeline';

/** The order of the story (§7.2); the last scene loops forever. */
export const STORY_SCENES = ['notebook', 'planet', 'crane', 'robot', 'pot', 'dots'] as const;
const DRAWN = ['notebook', 'planet', 'crane', 'robot', 'pot'] as const;
export type StorySceneId = (typeof STORY_SCENES)[number];

export type StoryOptions = {
  readonly canvas: HTMLCanvasElement;
  /** The box (CSS px) and the hand-off dot's diameter. */
  readonly sizePx: number;
  readonly dotPx: number;
  readonly calm: boolean;
  readonly seed: number;
  readonly palette: Palette;
  readonly onCaption: (index: number) => void;
  /** Test builds: start at this scene. */
  readonly startAt?: StorySceneId | undefined;
};

export type StoryHandle = {
  setPaused(paused: boolean): void;
  dispose(): void;
};

/** The drawing box is 512 units wide. */
const BOX_UNITS = 512;

export function createStory(raw: RawStory, options: StoryOptions): StoryHandle | null {
  const { canvas, sizePx, calm, palette, onCaption } = options;
  const context2d = canvas.getContext('2d');
  if (!context2d) return null;
  const ctx: CanvasRenderingContext2D = context2d;
  const dpr = Math.min(FINALE.dprMax, window.devicePixelRatio || 1);
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  const scale = (sizePx / BOX_UNITS) * dpr;

  const drawn: SceneData[] = DRAWN.map((id) => {
    const data = raw.scenes[id];
    if (!data) throw new Error(`no story scene ${id}`);
    return decodeScene(data, raw.unit);
  });
  const context: SceneContext = {
    palette,
    meta: raw.meta,
    seed: options.seed,
    dotR: (options.dotPx / 2) * (BOX_UNITS / sizePx),
  };
  const [notebook, planet, crane, robot, pot] = drawn as [
    SceneData,
    SceneData,
    SceneData,
    SceneData,
    SceneData,
  ];
  const dots = dotsScene(context, STORY.scenes.dots, calm);
  const scenes: SceneData[] = [...drawn, dots.scene];
  const scripts: SceneScript[] = [
    notebookScene(notebook, context),
    planetScene(planet, context, STORY.scenes.planet),
    craneScene(crane, context, STORY.scenes.crane),
    robotScene(robot, context, STORY.scenes.robot),
    potScene(pot, context, STORY.scenes.pot),
    dots.script,
  ];
  const timeline: Timeline = buildTimeline(scripts, STORY.morph.durationS);

  // Plans of the transformations, made when first needed (again with half the points on a slow device).
  let step = 1;
  const plans = new Map<string, MorphPlan>();
  const planOf = (from: number, to: number) => {
    const key = `${String(from)}-${String(to)}-${String(step)}`;
    let plan = plans.get(key);
    const a = scripts[from];
    const b = scripts[to];
    const sa = scenes[from];
    const sb = scenes[to];
    if (!plan && a && b && sa && sb) {
      plan = planMorph({ scene: sa, script: a }, { scene: sb, script: b }, step);
      plans.set(key, plan);
    }
    return plan;
  };

  const start = (() => {
    const index = options.startAt ? STORY_SCENES.indexOf(options.startAt) : -1;
    return index > 0 ? sceneStart(timeline, index) : 0;
  })();
  let time = start;
  let caption = -2;
  let paused = false;
  let raf = 0;
  let last = 0;
  const frames: number[] = [];

  const clear = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, canvas.width / 2, canvas.height / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  function renderMotion(t: number) {
    clear();
    const { step: current, local } = stepAt(timeline, t);
    if (current.kind === 'scene') {
      scripts[current.scene]?.draw(ctx, local, { reveal: null, alpha: 1 });
    } else {
      const plan = planOf(current.from, current.to);
      const from = scripts[current.from];
      const to = scripts[current.to];
      const toScene = scenes[current.to];
      if (plan && from && to && toScene) {
        drawMorph(ctx, plan, local, from, { scene: toScene, script: to }, palette);
      }
    }
    const next = captionAt(timeline, t);
    if (next !== caption) {
      caption = next;
      if (next >= 0) onCaption(next);
    }
  }

  /** Reduced motion: every scene as a still drawing, cross-fading to the next after a while. */
  function renderCalm(t: number) {
    clear();
    const hold = STORY.calmHoldS;
    const index = Math.min(scripts.length - 1, Math.floor(t / hold));
    const fade =
      index < scripts.length - 1
        ? clamp01((t - (index + 1) * hold + STORY.calmFadeS) / STORY.calmFadeS)
        : 0;
    const current = scripts[index];
    const next = scripts[index + 1];
    current?.draw(ctx, current.durationS, { reveal: null, alpha: 1 - fade });
    if (next && fade > 0) next.draw(ctx, next.durationS, { reveal: null, alpha: fade });
    // Its captions, spread over the still's time as over the scene's.
    const cue = current?.cues
      .filter(([at]) => (at / current.durationS) * hold <= t - index * hold)
      .at(-1);
    const shown = cue ? cue[1] : -1;
    if (shown !== caption && shown >= 0) {
      caption = shown;
      onCaption(shown);
    }
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (paused || document.hidden) return;
    time += dt;
    if (calm) renderCalm(time - start);
    else renderMotion(time);
    // Adaptive quality: frames slower than STORY.slowFrameMs on average → half the points from the next
    // transformation on.
    if (dt > 0) frames.push(dt * 1000);
    if (frames.length > 30) frames.shift();
    if (step === 1 && frames.length === 30) {
      const average = frames.reduce((a, b) => a + b, 0) / frames.length;
      if (average > STORY.slowFrameMs) step = 2;
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    setPaused(next) {
      paused = next;
    },
    dispose() {
      cancelAnimationFrame(raf);
    },
  };
}
