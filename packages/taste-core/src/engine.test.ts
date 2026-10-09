import { DECISIVE_ANSWERS_REQUIRED, tasteProfileV1Schema } from '@refectorio/contracts';
import { describe, expect, it } from 'vitest';
import catalogJson from '../data/catalog.json';
import { catalogSchema } from './catalog';
import { createTasteSession, prepareCatalog } from './engine';
import { candidates, SELECTION } from './selection';

const prepared = prepareCatalog(catalogSchema.parse(catalogJson));

function play(seed: number, answer: (index: number) => 'like' | 'dislike' | 'skip') {
  const session = createTasteSession(prepared, seed);
  for (let i = 0; i < 80 && !session.complete() && session.current(); i += 1)
    session.answer(answer(i));
  return session;
}

describe('taste session', () => {
  it('ends after exactly 10 decisive answers; skips do not count', () => {
    const session = play(1, (i) => (i % 3 === 0 ? 'skip' : i % 2 === 0 ? 'like' : 'dislike'));
    expect(session.decisiveCount()).toBe(DECISIVE_ANSWERS_REQUIRED);
    expect(session.complete()).toBe(true);
    expect(session.current()).toBeNull();
    expect(session.decisions().length).toBeGreaterThan(DECISIVE_ANSWERS_REQUIRED);
  });

  it('is deterministic for a seed, different between seeds', () => {
    const a = play(42, (i) => (i % 2 ? 'like' : 'dislike'))
      .decisions()
      .map((d) => d.dishId);
    const b = play(42, (i) => (i % 2 ? 'like' : 'dislike'))
      .decisions()
      .map((d) => d.dishId);
    const c = play(43, (i) => (i % 2 ? 'like' : 'dislike'))
      .decisions()
      .map((d) => d.dishId);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('never repeats a dish, starts with distinct base types, never puts two alike dishes in a row', () => {
    const session = play(7, () => 'like');
    const ids = session.decisions().map((d) => d.dishId);
    expect(new Set(ids).size).toBe(ids.length);
    const dishes = ids.map((id) => prepared.dishes[prepared.indexOf.get(id) ?? -1]);
    const firstTypes = dishes.slice(0, SELECTION.warmStartCards).map((d) => d?.baseType);
    expect(new Set(firstTypes).size).toBe(SELECTION.warmStartCards);
    for (let i = 1; i < dishes.length; i += 1) {
      const [a, b] = [dishes[i - 1], dishes[i]];
      if (!a || !b) throw new Error('unknown dish');
      expect(
        a.course === b.course || a.cuisine === b.cuisine || a.proteins[0] === b.proteins[0],
      ).toBe(false);
    }
  });

  it('undo returns the last decision and the same card again', () => {
    const session = createTasteSession(prepared, 5);
    const first = session.current();
    session.answer('like');
    const second = session.current();
    expect(second?.id).not.toBe(first?.id);
    expect(session.undo()).toEqual({ dishId: first?.id, answer: 'like' });
    expect(session.current()?.id).toBe(first?.id);
    expect(session.undo()).toBeNull();
  });

  it('peek predicts exactly the card that follows each answer', () => {
    for (const answer of ['like', 'dislike', 'skip'] as const) {
      const session = createTasteSession(prepared, 9);
      session.answer('dislike');
      const predicted = session.peek(answer);
      session.answer(answer);
      expect(session.current()?.id).toBe(predicted?.id);
    }
  });

  it('a saved game is restored by replaying its decisions; unknown dishes are ignored', () => {
    const played = play(11, (i) => (i % 4 === 0 ? 'skip' : 'like'));
    const saved = [
      ...played.decisions().slice(0, 5),
      { dishId: 'd_removed_dish', answer: 'like' as const },
    ];
    const restored = createTasteSession(prepared, 11, saved);
    expect(restored.decisions()).toEqual(played.decisions().slice(0, 5));
    expect(restored.current()?.id).toBe(played.decisions()[5]?.dishId);
  });

  it('after 5 skips in a row only well-known dishes come', () => {
    const session = createTasteSession(prepared, 3);
    for (let i = 0; i < SELECTION.skipStreakForFamiliar; i += 1) session.answer('skip');
    expect(session.skipStreak()).toBe(5);
    expect(session.current()?.traits.familiarityRu).toBeGreaterThanOrEqual(SELECTION.familiarFloor);
  });

  it('a picky player who skips everything exhausts the catalog and may continue', () => {
    const session = play(2, () => 'skip');
    expect(session.decisiveCount()).toBe(0);
    // 80 cards in the loop above; finish the catalog.
    while (session.current()) session.answer('skip');
    expect(session.exhausted()).toBe(true);
    expect(session.complete()).toBe(false);
  });

  it('builds a valid TasteProfileV1 with a prediction for every dish', () => {
    const profile = play(4, (i) => (i % 2 ? 'like' : 'dislike')).profile();
    expect(tasteProfileV1Schema.safeParse(profile).success).toBe(true);
    expect(profile.predictions).toHaveLength(prepared.dishes.length);
    expect(profile.features.length).toBe(prepared.space.size);
  });

  it('a person who dislikes every meat dish gets the avoidsMeat hint', () => {
    const session = createTasteSession(prepared, 8);
    for (let i = 0; i < 60 && !session.complete(); i += 1) {
      const dish = session.current();
      if (!dish) break;
      const meat = dish.proteins.some((p) => ['beef', 'pork', 'lamb', 'poultry'].includes(p));
      session.answer(meat ? 'dislike' : 'like');
    }
    const hints = session.profile().hints.map((h) => h.hint);
    expect(hints).toContain('avoidsMeat');
    expect(hints).not.toContain('likesMeat');
  });

  it('chooses a card in well under 5 ms', () => {
    const session = createTasteSession(prepared, 1);
    for (let i = 0; i < 6; i += 1) session.answer(i % 2 ? 'like' : 'dislike');
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) createTasteSession(prepared, 1, session.decisions()).current();
    // Includes the replay of 6 answers each time; the budget of ТЗ §9.3 is per selection.
    expect((performance.now() - started) / 20).toBeLessThan(5);
  });

  it('candidate rules fall back instead of leaving nothing', () => {
    const ctx = {
      dishes: prepared.dishes,
      vectors: prepared.vectors,
      nearDuplicates: prepared.nearDuplicates,
      posterior: prepared.prior,
      skipBelief: { mean: 0, variance: 1 },
      shown: prepared.dishes.map((_, i) => i).slice(1),
      skipStreak: 9,
      seed: 1,
    };
    expect(candidates(ctx)).toEqual([0]);
    expect(candidates({ ...ctx, shown: prepared.dishes.map((_, i) => i) })).toEqual([]);
  });
});
