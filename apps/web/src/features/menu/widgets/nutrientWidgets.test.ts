import { EMPTY_TRACKING, markEaten, type MenuResponse, type Plan } from '@refectorio/menu-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { quizAnswers } from '../../../../../../packages/menu-core/src/testing';
import { handle } from '../engine/handler';
import { dailyTarget, recommended, widgetValue } from './nutrientWidgets';

const TODAY = '2026-11-02';
let plan: Plan;

describe('custom widgets', () => {
  beforeAll(() => {
    const out: MenuResponse[] = [];
    handle({ id: 1, type: 'generate', answers: quizAnswers(), today: TODAY, seed: 5 }, (r) =>
      out.push(r),
    );
    const last = out.at(-1);
    if (last?.type !== 'plan') throw new Error('no plan');
    plan = last.plan;
  }, 30_000);

  it('recommends by the person: vegan, women 19–50, 65+, strength, sleep', () => {
    const vegan = quizAnswers({ diet: 'vegan' });
    expect(recommended(vegan, plan)).toEqual(
      expect.arrayContaining([
        'vitaminB12Ug',
        'ironMg',
        'calciumMg',
        'vitaminDUg',
        'alaG',
        'iodineUg',
      ]),
    );
    const base = quizAnswers();
    const woman = quizAnswers({ body: { ...base.body, sex: 'female', ageYears: 30 } });
    expect(recommended(woman, plan)).toContain('ironMg');
    const older = quizAnswers({ body: { ...base.body, ageYears: 70 } });
    expect(recommended(older, plan)).toEqual(
      expect.arrayContaining(['vitaminDUg', 'vitaminB12Ug', 'calciumMg']),
    );
    const sleeper = quizAnswers({ extraGoals: ['sleep'] });
    expect(recommended(sleeper, plan)).toContain('caffeineMg');
    expect(recommended(null, plan)).toEqual([]);
  });

  it('targets: norms, limits (salt in grams) and «нормы нет»', () => {
    expect(dailyTarget('proteinG', plan.targets)).toEqual({
      amount: plan.targets.proteinG.target,
      kind: 'norm',
    });
    expect(dailyTarget('sodiumMg', plan.targets)).toEqual({
      amount: (plan.targets.sodiumMaxMg * 2.5) / 1000,
      kind: 'limit',
    });
    expect(dailyTarget('epaDhaG', plan.targets)).toBeNull();
  });

  it('only eaten dishes count; the day, a meal and the week', () => {
    const widget = { id: 'w', nutrient: 'proteinG', scope: 'day', color: 'plum' } as const;
    expect(widgetValue(widget, plan, EMPTY_TRACKING, TODAY).value).toBe(0);
    const day = plan.days.find((d) => d.date === TODAY);
    const [mealId, items] = Object.entries(day?.meals ?? {})[0] ?? [];
    const item = items?.[0];
    if (!mealId || !item) throw new Error('no dish');
    const marked = markEaten(
      EMPTY_TRACKING,
      plan,
      TODAY,
      mealId,
      item.itemId,
      true,
      `${TODAY}T09:00:00Z`,
      TODAY,
    );
    if (!marked.ok) throw new Error('no mark');
    const protein = item.nutrients.proteinG ?? 0;
    expect(widgetValue(widget, plan, marked.value, TODAY).value).toBeCloseTo(protein);
    expect(
      widgetValue({ ...widget, scope: 'meal', mealId }, plan, marked.value, TODAY).value,
    ).toBeCloseTo(protein);
    expect(
      widgetValue({ ...widget, scope: 'meal', mealId: 'other' }, plan, marked.value, TODAY).value,
    ).toBe(0);
    const week = widgetValue({ ...widget, scope: 'week' }, plan, marked.value, TODAY);
    expect(week.value).toBeCloseTo(protein);
    expect(week.target?.amount).toBeGreaterThan(plan.targets.proteinG.target);
  });
});
