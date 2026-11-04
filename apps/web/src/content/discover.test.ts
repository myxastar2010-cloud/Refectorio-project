import { describe, expect, it } from 'vitest';
import { discover, discoverSchema } from './discover.ru';

describe('discover content', () => {
  it('matches its schema', () => {
    expect(discoverSchema.safeParse(discover).success).toBe(true);
  });

  it('has levels that grow and foods that lift and lower the wellbeing', () => {
    const xp = discover.kiki.levels.items.map((level) => level.xp);
    expect([...xp].sort((a, b) => a - b)).toEqual(xp);
    const effects = discover.kiki.stage.foods.map((food) => food.effect);
    expect(effects.some((value) => value > 0)).toBe(true);
    expect(effects.some((value) => value < 0)).toBe(true);
  });

  it('keeps the tone: no guilt, no medical promises', () => {
    const all = JSON.stringify(discover).toLowerCase();
    expect(all).not.toMatch(/вылеч|гарантир|диагноз|лишний вес|плохая еда/);
  });
});
