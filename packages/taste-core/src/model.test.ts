import { describe, expect, it } from 'vitest';
import type { FeatureSpace, SparseVector } from './features';
import {
  clonePosterior,
  latent,
  likeProbability,
  priorPosterior,
  update,
  type PriorConfig,
} from './model';
import { createRandom } from './random';
import { PRIOR_SKIP_BELIEF, skipProbability, updateSkipBelief } from './skip';
import { sigmoid } from './stats';

const ids = ['bias', 'protein:beef', 'protein:pork', 'protein:fish', 'trait:popularity'];
const space: FeatureSpace = {
  ids,
  indexOf: new Map(ids.map((id, i) => [id, i])),
  size: ids.length,
};
const prior: PriorConfig = {
  baseLikeRate: 0.5,
  means: { 'trait:popularity': 1 },
  sds: { bias: 0.5, 'protein:': 1, 'trait:popularity': 0.3 },
  groups: [
    {
      name: 'redMeat',
      sd: 1,
      members: [
        ['protein:beef', 1],
        ['protein:pork', 1],
      ],
    },
  ],
};
const vec = (pairs: Record<string, number>): SparseVector => {
  const index = Object.keys(pairs).map((id) => space.indexOf.get(id) ?? -1);
  return { index, value: Object.values(pairs) };
};
const beef = vec({ bias: 1, 'protein:beef': 1 });
const pork = vec({ bias: 1, 'protein:pork': 1 });
const fish = vec({ bias: 1, 'protein:fish': 1 });

describe('prior', () => {
  it('sets the bias from the base like rate and adds group covariance', () => {
    const p = priorPosterior(space, prior);
    expect(p.mean[0]).toBeCloseTo(0, 12);
    expect(p.mean[4]).toBe(1);
    // beef–pork share the red-meat effect, fish does not.
    expect(p.cov[1 * 5 + 2]).toBeCloseTo(1, 12);
    expect(p.cov[1 * 5 + 3]).toBe(0);
    expect(p.cov[1 * 5 + 1]).toBeCloseTo(2, 12);
  });

  it('gives unknown features a default SD and ignores group members not in the space', () => {
    const p = priorPosterior(space, {
      ...prior,
      sds: {},
      groups: [{ name: 'x', sd: 1, members: [['missing', 1]] }],
    });
    expect(p.cov[0]).toBeCloseTo(0.09, 12);
  });
});

describe('update', () => {
  it('a like raises the dish and its group, leaves unrelated features alone', () => {
    const p = priorPosterior(space, prior);
    const before = { beef: likeProbability(p, beef), pork: likeProbability(p, pork) };
    const fishBefore = latent(p, vec({ 'protein:fish': 1 })).mean;
    update(p, beef, true);
    expect(likeProbability(p, beef)).toBeGreaterThan(before.beef);
    // Structured covariance: the answer about beef informs pork.
    expect(likeProbability(p, pork)).toBeGreaterThan(before.pork);
    expect(latent(p, vec({ 'protein:fish': 1 })).mean).toBeCloseTo(fishBefore, 12);
  });

  it('a dislike lowers it; uncertainty about the asked dish always shrinks', () => {
    const p = priorPosterior(space, prior);
    const v0 = latent(p, pork).variance;
    const p0 = likeProbability(p, pork);
    update(p, pork, false);
    expect(likeProbability(p, pork)).toBeLessThan(p0);
    expect(latent(p, pork).variance).toBeLessThan(v0);
  });

  it('keeps the covariance symmetric and positive definite over many answers', () => {
    const p = priorPosterior(space, prior);
    const random = createRandom(11);
    const dishes = [beef, pork, fish];
    for (let i = 0; i < 200; i += 1) update(p, dishes[i % 3] ?? beef, random.next() < 0.5);
    for (let i = 0; i < 5; i += 1) {
      expect(p.cov[i * 5 + i] ?? 0).toBeGreaterThan(0);
      for (let j = 0; j < 5; j += 1) {
        expect(p.cov[i * 5 + j]).toBeCloseTo(p.cov[j * 5 + i] ?? 0, 9);
      }
    }
    for (const d of dishes) expect(latent(p, d).variance).toBeGreaterThan(0);
  });

  it('learns a simulated person: likes beef and pork, dislikes fish', () => {
    const p = priorPosterior(space, prior);
    const random = createRandom(3);
    const truth = (v: SparseVector) => (v === fish ? -2 : 2);
    for (let i = 0; i < 30; i += 1) {
      const d = [beef, pork, fish][i % 3] ?? beef;
      update(p, d, random.next() < sigmoid(truth(d)));
    }
    expect(likeProbability(p, beef)).toBeGreaterThan(0.7);
    expect(likeProbability(p, pork)).toBeGreaterThan(0.7);
    expect(likeProbability(p, fish)).toBeLessThan(0.35);
  });

  it('clonePosterior copies (updates do not leak)', () => {
    const p = priorPosterior(space, prior);
    const copy = clonePosterior(p);
    update(copy, beef, true);
    expect(likeProbability(copy, beef)).not.toBe(likeProbability(p, beef));
  });
});

describe('skip model', () => {
  it('unfamiliar dishes are skipped more; skips lower the tolerance, answers raise it', () => {
    expect(skipProbability(PRIOR_SKIP_BELIEF, 0.2)).toBeGreaterThan(
      skipProbability(PRIOR_SKIP_BELIEF, 0.95),
    );
    expect(skipProbability(PRIOR_SKIP_BELIEF, 1)).toBeLessThan(0.1);
    let belief = PRIOR_SKIP_BELIEF;
    for (let i = 0; i < 4; i += 1) belief = updateSkipBelief(belief, 0.5, true);
    expect(belief.mean).toBeLessThan(0);
    expect(belief.variance).toBeLessThan(PRIOR_SKIP_BELIEF.variance);
    expect(skipProbability(belief, 0.5)).toBeGreaterThan(skipProbability(PRIOR_SKIP_BELIEF, 0.5));
    const answered = updateSkipBelief(PRIOR_SKIP_BELIEF, 0.3, false);
    expect(answered.mean).toBeGreaterThan(0);
  });
});
