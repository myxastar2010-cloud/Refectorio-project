import type { MenuRequest, MenuResponse, Plan } from '@refectorio/menu-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { quizAnswers } from '../../../../../../packages/menu-core/src/testing';
import { handle } from './handler';

const TODAY = '2026-11-02';
const answers = quizAnswers();

let nextId = 1;
function run(request: Record<string, unknown>): MenuResponse[] {
  const out: MenuResponse[] = [];
  handle({ id: nextId++, ...request } as MenuRequest, (r) => out.push(r));
  return out;
}
const last = (responses: MenuResponse[]): MenuResponse => {
  const r = responses.at(-1);
  if (!r) throw new Error('no responses');
  return r;
};
const planOf = (responses: MenuResponse[]): Plan => {
  const r = last(responses);
  if (r.type !== 'plan') throw new Error(`expected plan, got ${JSON.stringify(r).slice(0, 200)}`);
  return r.plan;
};

let first: MenuResponse[];
let plan: Plan;

describe('menu handler', () => {
  beforeAll(() => {
    first = run({ type: 'generate', answers, today: TODAY, seed: 42 });
    plan = planOf(first);
  }, 30_000);

  it('init reports progress, then ready', () => {
    const out = run({ type: 'init' });
    expect(out.map((r) => r.type)).toEqual(['progress', 'ready']);
    expect(out.every((r) => r.id === out[0]?.id)).toBe(true);
  });

  it('generate refuses malformed rules and meals with typed errors, not internal ones (m12)', () => {
    const rules = last(
      run({ type: 'generate', answers, today: TODAY, seed: 1, rules: [{ kind: 'nope' }] }),
    );
    expect(rules.type === 'error' && rules.error.code === 'plan' && rules.error.error.code).toBe(
      'invalidRules',
    );
    const brunch = { id: 'brunch', kind: 'brunch', titleRu: 'Бранч', order: 0 };
    const meals = last(
      run({ type: 'generate', answers, today: TODAY, seed: 1, structure: [brunch] }),
    );
    expect(meals.type === 'error' && meals.error.code === 'plan' && meals.error.error.code).toBe(
      'structure',
    );
  });

  it('generate reports progress and a plan with 8-14 non-empty days', () => {
    expect(first.length).toBeGreaterThan(1);
    expect(first.slice(0, -1).every((r) => r.type === 'progress')).toBe(true);
    expect(plan.days.length).toBeGreaterThanOrEqual(8);
    expect(plan.days.length).toBeLessThanOrEqual(14);
    expect(plan.structure.length).toBeGreaterThan(0);
    for (const day of plan.days)
      for (const meal of plan.structure) expect(day.meals[meal.id]?.length).toBeGreaterThan(0);
  });

  it('is deterministic for the same request (profile cache)', () => {
    const again = planOf(run({ type: 'generate', answers, today: TODAY, seed: 42 }));
    expect(again).toEqual(plan);
  });

  it('answers invalid answers with a profile error', () => {
    const out = run({ type: 'generate', answers: {}, today: TODAY, seed: 1 });
    const r = last(out);
    expect(r.type).toBe('error');
    if (r.type === 'error') expect(r.error.code).toBe('profile');
  });

  it('search finds items of the plan', () => {
    const queries = ['гречка', 'курица', 'рис', 'яйцо', 'суп', 'салат'];
    const results = queries.map((query) => last(run({ type: 'search', plan, query })));
    for (const r of results) expect(r.type).toBe('search');
    const total = results.reduce((n, r) => n + (r.type === 'search' ? r.hits.length : 0), 0);
    expect(total).toBeGreaterThan(0);
  });

  it('alternatives lists replacements for a slot', () => {
    const slot = { date: plan.days[0]?.date, meal: plan.structure[0]?.id, index: 0 };
    const r = last(run({ type: 'alternatives', answers, plan, slot, k: 5 }));
    expect(r.type).toBe('alternatives');
    if (r.type === 'alternatives') {
      expect(r.alternatives.length).toBeGreaterThan(0);
      expect(r.alternatives.length).toBeLessThanOrEqual(5);
    }
  });

  it('apply regenerate bumps the revision', () => {
    const next = planOf(run({ type: 'apply', op: 'regenerate', answers, plan, today: TODAY }));
    expect(next.revision).toBe(plan.revision + 1);
  });

  it('apply extendHorizon bumps the revision and extends the horizon', () => {
    const d = new Date(`${plan.horizonEnd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    const toDate = d.toISOString().slice(0, 10);
    const next = planOf(
      run({ type: 'apply', op: 'extendHorizon', answers, plan, today: TODAY, toDate }),
    );
    expect(next.revision).toBe(plan.revision + 1);
    expect(next.days.length).toBeGreaterThan(plan.days.length);
  });
});
