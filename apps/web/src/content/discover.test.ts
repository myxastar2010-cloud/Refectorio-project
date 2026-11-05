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

  it('uses the presentation words for the two types, no old nicknames (D-102)', () => {
    const all = JSON.stringify(discover);
    expect(all).not.toMatch(/кайфожор|торопыж|идёте к цели/i);
    expect(discover.segments.kinds.map((kind) => kind.name)).toEqual([
      'Искатель впечатлений',
      'Ценитель времени',
    ]);
  });

  it('is a test of 30 seconds with five questions, and the mood of Kiki follows four actions', () => {
    expect(discover.quiz.seconds).toBe('30');
    expect(discover.quiz.title).toContain('30 секунд');
    expect(discover.quiz.questions).toHaveLength(5);
    expect(discover.kiki.title).toBe('Знакомьтесь, ваш личный ИИ Кики');
    expect(discover.kiki.reacts.items.map((item) => item.mood)).toEqual([
      'glow',
      'good',
      'tired',
      'sad',
    ]);
  });

  it('keeps the tone: no guilt, no medical promises', () => {
    const all = JSON.stringify(discover).toLowerCase();
    expect(all).not.toMatch(/вылеч|гарантир|диагноз|лишний вес|плохая еда/);
  });
});
