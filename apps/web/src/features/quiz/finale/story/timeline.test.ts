import { describe, expect, it } from 'vitest';
import { STORY } from '../../../../motion/tokens';
import storyData from './story-data.json';
import { decodeScene, type RawStory } from './data';
import { IDENTITY } from './draw';
import { projectDot } from './laterScenes';
import { planMorph } from './morph';
import type { SceneScript } from './scenes';
import { buildTimeline, captionAt, sceneStart, stepAt } from './timeline';

const raw = storyData as unknown as RawStory;
const scenes = [
  { durationS: 4, cues: [[0, 0] as const, [2, 1] as const] },
  { durationS: 3, cues: [[0, 2] as const] },
  { durationS: 6, cues: [[0, 3] as const] },
];

describe('the generation story timeline (stage 3, §7.4)', () => {
  const timeline = buildTimeline(scenes, 1.5);

  it('puts a transformation between every two scenes; the last scene loops', () => {
    expect(timeline.steps.map((s) => s.kind)).toEqual([
      'scene',
      'morph',
      'scene',
      'morph',
      'scene',
    ]);
    expect(sceneStart(timeline, 1)).toBe(5.5);
    expect(timeline.loopStart).toBe(4 + 1.5 + 3 + 1.5);
    expect(stepAt(timeline, 4.2).step.kind).toBe('morph');
    expect(stepAt(timeline, 4.2).local).toBeCloseTo(0.2);
    // Far later: still the last scene, inside one loop.
    const late = stepAt(timeline, 10 + 6 * 7 + 1.25);
    expect(late.step.kind).toBe('scene');
    expect(late.local).toBeCloseTo(1.25);
  });

  it('shows each caption from its scene cue on, in order', () => {
    expect(captionAt(timeline, -0.1)).toBe(-1);
    expect(captionAt(timeline, 0)).toBe(0);
    expect(captionAt(timeline, 2.5)).toBe(1);
    expect(captionAt(timeline, 5.6)).toBe(2);
    expect(captionAt(timeline, 500)).toBe(3);
  });

  it('the first pass of the real story lasts 20–28 s (§7.2)', () => {
    const { notebook, planet, crane, robot, pot } = STORY.scenes;
    const firstPass = notebook + planet + crane + robot + pot + 5 * STORY.morph.durationS;
    // The transformation's beats fit inside it.
    const m = STORY.morph;
    expect(m.scatterFromS + m.scatterSweepS + m.scatterS + m.landS).toBeLessThanOrEqual(
      m.durationS + 0.2,
    );
    expect(m.revealFromS + m.revealSweepS + m.revealS).toBeLessThanOrEqual(m.durationS + 1e-9);
    expect(firstPass).toBeGreaterThanOrEqual(20);
    expect(firstPass).toBeLessThanOrEqual(28);
  });
});

describe('transformations and loops', () => {
  const still: SceneScript = {
    id: 'still',
    durationS: 1,
    cues: [],
    partMatrix: () => IDENTITY,
    draw: () => undefined,
  };

  it('pairs every point of one drawing with a point of the next, in a sweep', () => {
    const notebookRaw = raw.scenes.notebook;
    const planetRaw = raw.scenes.planet;
    if (!notebookRaw || !planetRaw) throw new Error('no scenes');
    const notebook = decodeScene(notebookRaw, raw.unit);
    const planet = decodeScene(planetRaw, raw.unit);
    const plan = planMorph({ scene: notebook, script: still }, { scene: planet, script: still });
    expect(plan.count).toBe(Math.min(notebook.cloudOut.count, planet.cloudIn.count));
    // Every point has a ring slot, and the slots go once around the circle in order.
    expect(plan.slot.length).toBe(plan.count);
    expect(Math.min(...plan.slot)).toBeGreaterThan(-Math.PI);
    expect(Math.max(...plan.slot)).toBeLessThan(Math.PI);
    expect(Math.max(...plan.order)).toBeLessThan(1);
    // Half the points on a slow device.
    expect(
      planMorph({ scene: notebook, script: still }, { scene: planet, script: still }, 2).count,
    ).toBe(Math.floor(plan.count / 2));
  });

  it('every drawing has its clouds; the scenes that loop end where they began', () => {
    for (const id of ['notebook', 'planet', 'crane', 'robot', 'pot']) {
      const scene = raw.scenes[id];
      expect(scene?.in.c.length, id).toBe(180);
      expect(scene?.out.c.length, id).toBe(180);
    }
    const dot = { lat: 0.3, lon: 1.2 };
    const start = projectDot(dot, 0, STORY.scenes.dots);
    const end = projectDot(dot, STORY.scenes.dots, STORY.scenes.dots);
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
  });
});
