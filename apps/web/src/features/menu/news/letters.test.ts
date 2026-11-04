import {
  EMPTY_TRACKING,
  markEaten,
  type MenuResponse,
  type Plan,
  type Tracking,
} from '@refectorio/menu-core';
import { beforeAll, describe, expect, it } from 'vitest';
import { quizAnswers } from '../../../../../../packages/menu-core/src/testing';
import { handle } from '../engine/handler';
import { DEFAULT_SETTINGS, type Letter } from '../store/schema';
import { changeLetter, letterText, newLetters, tipsFor } from './letters';

const START = '2026-11-02';
const NEXT = '2026-11-03';
let plan: Plan;

const fixed = () => 0.42;
const state = (over: Partial<Parameters<typeof newLetters>[0]> = {}) => ({
  plan,
  tracking: EMPTY_TRACKING,
  letters: [] as Letter[],
  settings: DEFAULT_SETTINGS,
  today: START,
  deemphasizeNumbers: false,
  ...over,
});

describe('letters from Kiki', () => {
  beforeAll(() => {
    const out: MenuResponse[] = [];
    handle({ id: 1, type: 'generate', answers: quizAnswers(), today: START, seed: 3 }, (r) =>
      out.push(r),
    );
    const last = out.at(-1);
    if (last?.type !== 'plan') throw new Error('no plan');
    plan = last.plan;
  }, 30_000);

  it('the first open: the welcome pair, unread, with different pictures', () => {
    const { letters, lastLetterDay } = newLetters(state(), new Date('2026-11-02T08:00:00Z'), fixed);
    expect(letters.map((l) => l.kind)).toEqual(['welcome', 'localOnly']);
    expect(letters.every((l) => !l.read)).toBe(true);
    expect(letters[0]?.image).not.toBe(letters[1]?.image);
    expect(lastLetterDay).toBe(START);
  });

  it('at most one letter a day; none with the daily digest off', () => {
    const first = newLetters(state(), new Date('2026-11-02T08:00:00Z'), fixed);
    const settings = { ...DEFAULT_SETTINGS, lastLetterDay: START };
    expect(
      newLetters(state({ letters: first.letters, settings }), new Date(), fixed).letters,
    ).toEqual([]);
    const next = newLetters(
      state({ letters: first.letters, settings, today: NEXT }),
      new Date('2026-11-03T08:00:00Z'),
      fixed,
    );
    expect(next.letters).toHaveLength(1);
    expect(next.lastLetterDay).toBe(NEXT);
    const off = { ...settings, dailyDigest: false };
    expect(
      newLetters(state({ letters: first.letters, settings: off, today: NEXT }), new Date(), fixed)
        .letters,
    ).toEqual([]);
  });

  it("yesterday with marks: a recap with the plan's own numbers; calm — no calories", () => {
    const first = newLetters(state(), new Date('2026-11-02T08:00:00Z'), fixed);
    const day = plan.days.find((d) => d.date === START);
    const [mealId, items] = Object.entries(day?.meals ?? {})[0] ?? [];
    const item = items?.[0];
    if (!mealId || !item) throw new Error('no dish');
    const marked = markEaten(
      EMPTY_TRACKING,
      plan,
      START,
      mealId,
      item.itemId,
      true,
      `${START}T09:00:00Z`,
      START,
    );
    if (!marked.ok) throw new Error('no mark');
    const tracking: Tracking = marked.value;
    const settings = { ...DEFAULT_SETTINGS, lastLetterDay: START };
    const { letters } = newLetters(
      state({ letters: first.letters, settings, today: NEXT, tracking }),
      new Date('2026-11-03T08:00:00Z'),
      fixed,
    );
    const recap = letters[0];
    expect(recap?.kind).toBe('recap');
    if (!recap) return;
    expect(recap.data.meals).toBe(1);
    expect(recap.data.eaten).toBe(Math.round(item.nutrients.energyKcal ?? 0));
    expect(letterText(recap, plan, false, NEXT).body).toMatch(/ккал/);
    expect(letterText(recap, plan, true, NEXT).body).not.toMatch(/ккал/);
  });

  it('tips the plan calls for, the one sent longest ago first; calm numbers — water only', () => {
    const tips = tipsFor(plan);
    expect(tips).toContain('water');
    const settings = { ...DEFAULT_SETTINGS, lastLetterDay: START };
    const old: Letter[] = [
      { id: 'w', kind: 'welcome', at: '', read: true, image: 1, data: {} },
      { id: 't', kind: 'tip', at: '', read: true, image: 2, data: { tip: 'water' } },
    ];
    const next = newLetters(state({ letters: old, settings, today: NEXT }), new Date(), fixed);
    // No marks yesterday: a tip, and not the water tip just sent (unless it is the only one).
    expect(next.letters[0]?.kind).toBe('tip');
    if (tips.length > 1) expect(next.letters[0]?.data.tip).not.toBe('water');
    const calm = newLetters(
      state({ letters: old, settings, today: NEXT, deemphasizeNumbers: true }),
      new Date(),
      fixed,
    );
    expect(calm.letters[0]?.data.tip).toBe('water');
    expect(letterText(calm.letters[0] as Letter, plan, true, NEXT).body).toMatch(/стакан/);
  });

  it('a change receipt arrives read', () => {
    expect(changeLetter([], 'Меню пересобрано', new Date(), fixed)).toMatchObject({
      kind: 'change',
      read: true,
      data: { what: 'Меню пересобрано' },
    });
  });
});
