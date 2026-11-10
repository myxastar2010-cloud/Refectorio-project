import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../messages';
import { buildDigest } from './digest';
import { fixtureEnv, FIXTURE_TODAY } from './fixture';
import { executeTool } from './tools';

const { env, plan } = fixtureEnv();
const json = (v: unknown) => JSON.stringify(v);
const firstItem = () => {
  const day = plan.days[0];
  if (!day) throw new Error('no day');
  const meal = plan.structure[0];
  const item = meal && day.meals[meal.id]?.[0];
  if (!meal || !item) throw new Error('no item');
  return { day, meal, item };
};

describe('read tools', () => {
  it('get_menu returns days with names, portions and kcal', () => {
    const out = executeTool(env, 'get_menu', { from: FIXTURE_TODAY, to: '2026-11-11' });
    const result = out.result as {
      days: { date: string; meals: { items: { kcal: number }[] }[] }[];
    };
    expect(result.days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11']);
    expect(result.days[0]?.meals[0]?.items[0]?.kcal).toBeGreaterThan(0);
  });

  it('get_menu outside the plan explains the range', () => {
    expect(
      json(executeTool(env, 'get_menu', { from: '2030-01-01', to: '2030-01-02' }).result),
    ).toContain('covers');
  });

  it('find_in_menu finds a planned dish on every day it is planned', () => {
    const { item } = firstItem();
    const name = env.items.get(item.itemId)?.nameRu ?? '';
    const out = executeTool(env, 'find_in_menu', { query: name }).result as {
      found: { itemId: string; date: string }[];
    };
    expect(out.found.some((f) => f.itemId === item.itemId && f.date === FIXTURE_TODAY)).toBe(true);
    const none = executeTool(env, 'find_in_menu', { query: 'жареный крокодил' }).result;
    expect(json(none)).toContain('not in the menu');
  });

  it('resolve_food_terms maps words to ids and marks unmatched ones', () => {
    const out = executeTool(env, 'resolve_food_terms', { terms: ['чеснок', 'пшёнка', 'абырвалг'] })
      .result as { terms: { term: string; matches: { id: string }[]; unmatched?: boolean }[] };
    expect(out.terms[0]?.matches.map((m) => m.id)).toContain('garlic');
    expect(out.terms[1]?.matches.length).toBeGreaterThan(0);
    expect(out.terms[2]?.unmatched).toBe(true);
  });

  it('get_item_details: allergens, standard portion and the day portion', () => {
    const { item } = firstItem();
    const out = executeTool(env, 'get_item_details', { itemId: item.itemId, date: FIXTURE_TODAY })
      .result as { standardPortion: { kcal: number }; onThatDay?: { kcal: number } };
    expect(out.standardPortion.kcal).toBeGreaterThan(0);
    expect(out.onThatDay?.kcal).toBe(Math.round(item.nutrients.energyKcal ?? 0));
    expect(json(executeTool(env, 'get_item_details', { itemId: 'd_nope_nope' }).result)).toContain(
      'unknown itemId',
    );
  });

  it('get_targets, get_progress, get_profile_summary, get_recipe', () => {
    const targets = executeTool(env, 'get_targets', {}).result as {
      kcal: number;
      drinkingMl: number;
    };
    expect(targets.kcal).toBe(Math.round(plan.targets.energyKcal));
    expect(targets.drinkingMl).toBeGreaterThan(0);
    const progress = executeTool(env, 'get_progress', { date: FIXTURE_TODAY }).result as {
      eaten: { kcal: number };
    };
    expect(progress.eaten.kcal).toBe(0);
    const profile = executeTool(env, 'get_profile_summary', {}).result as {
      goal: string;
      meals: unknown[];
      safety: { audience: string };
    };
    expect(profile.goal).toBe('maintain');
    expect(profile.safety.audience).toBe('adult');
    expect(profile.meals.length).toBe(plan.structure.length);
    const { item } = firstItem();
    expect(json(executeTool(env, 'get_recipe', { itemId: item.itemId }).result)).toContain(
      '"available":false',
    );
  });

  it('bad arguments come back as an error, not an exception', () => {
    expect(json(executeTool(env, 'get_menu', { from: 'вчера' }).result)).toContain(
      'invalid arguments',
    );
    expect(json(executeTool(env, 'kb_search', { query: 'xx' }).result)).toContain(
      'not a browser tool',
    );
  });
});

describe('propose tools', () => {
  it('minNutrient on dinners → a preview with a code-written summary', () => {
    const out = executeTool(env, 'propose_menu_change', {
      rules: [
        {
          kind: 'minNutrient',
          nutrient: 'proteinG',
          per: 'meal',
          value: 20,
          meals: ['dinner'],
          textRu: 'Ужин — от 20 г белка',
        },
      ],
      reasonRu: 'больше белка вечером',
    });
    const result = out.result as { previewId: string; summaryRu: string };
    expect(result.previewId).toMatch(/^pv-/);
    expect(result.summaryRu).toContain('Ужин — от 20 г белка');
    const preview = out.previews?.[0];
    expect(preview?.plan.rules.some((r) => r.textRu === 'Ужин — от 20 г белка')).toBe(true);
    expect(preview?.baseRevision).toBe(plan.revision);
    // Nothing changed in the env: proposals never write.
    expect(env.plan.rules.length).toBe(0);
  });

  it('an exclusion by category removes the dishes that contain it', () => {
    const out = executeTool(env, 'propose_menu_change', {
      rules: [{ kind: 'excludeIngredient', target: { category: 'garlic' }, textRu: 'Без чеснока' }],
      reasonRu: 'аллергия на чеснок',
    });
    const preview = out.previews?.[0];
    expect(preview).toBeDefined();
    const garlic = preview?.plan.days.flatMap((d) => Object.values(d.meals).flat());
    const withGarlic = (garlic ?? []).filter((i) =>
      env.foods.foods.find((f) => f.id === i.itemId)?.categories.has('garlic'),
    );
    const fromToday = preview?.plan.days.filter((d) => d.date >= FIXTURE_TODAY) ?? [];
    expect(fromToday.length).toBeGreaterThan(0);
    expect(withGarlic.length).toBe(0);
  });

  it('invented ids and unknown rules are refused with a hint', () => {
    expect(
      json(
        executeTool(env, 'propose_menu_change', {
          rules: [{ kind: 'excludeItem', itemId: 'd_made_up', textRu: 'Без выдумки' }],
          reasonRu: 'тест',
        }).result,
      ),
    ).toContain('unknown itemId');
    expect(
      json(
        executeTool(env, 'propose_menu_change', {
          rules: [{ kind: 'preferLess', target: { category: 'unicorns' }, textRu: 'Меньше' }],
          reasonRu: 'тест',
        }).result,
      ),
    ).toContain('unknown category');
    expect(
      json(
        executeTool(env, 'propose_menu_change', {
          rules: [],
          removeRuleIds: ['x'],
          reasonRu: 'тест',
        }).result,
      ),
    ).toContain('unknown rule ids');
    expect(
      json(executeTool(env, 'propose_menu_change', { rules: [], reasonRu: 'тест' }).result),
    ).toContain('nothing to change');
  });

  it('goal change: targets before → after, lose is refused when not allowed', () => {
    const out = executeTool(env, 'propose_goal_change', { goal: 'lose' });
    const result = out.result as {
      stats?: { targets?: { kcalBefore: number; kcalAfter: number } };
    };
    expect(result.stats?.targets?.kcalAfter).toBeLessThan(result.stats?.targets?.kcalBefore ?? 0);
    const teen = fixtureEnv({
      overrides: {
        body: { sex: 'female', ageYears: 15, heightCm: 160, weightKg: 50, mode: 'self' },
      },
    });
    expect(json(executeTool(teen.env, 'propose_goal_change', { goal: 'lose' }).result)).toContain(
      'not available',
    );
  });

  it('meal structure: add a snack; removing every main meal is refused', () => {
    const out = executeTool(env, 'propose_meal_structure', { add: ['snack'] });
    expect((out.result as { previewId?: string }).previewId).toBeDefined();
    const mains = plan.structure.filter((m) => m.kind !== 'snack').map((m) => m.id);
    expect(json(executeTool(env, 'propose_meal_structure', { remove: mains }).result)).toContain(
      'cannot remove',
    );
  });

  it('alternatives: options with their own previews', () => {
    const { day, meal, item } = firstItem();
    const out = executeTool(env, 'propose_alternatives', {
      date: day.date,
      mealId: meal.id,
      itemId: item.itemId,
      k: 3,
    });
    const result = out.result as { options: { previewId: string; itemId: string }[] };
    expect(result.options.length).toBeGreaterThan(0);
    expect(out.previews?.length).toBe(result.options.length);
    expect(
      json(
        executeTool(env, 'propose_alternatives', {
          date: day.date,
          mealId: meal.id,
          itemId: 'd_x',
          k: 2,
        }).result,
      ),
    ).toContain('not in that meal');
  });
});

describe('digest', () => {
  it('fits its budget and carries no body data', () => {
    const digest = buildDigest(env, { selectedDate: FIXTURE_TODAY, screen: 'chat' });
    expect(estimateTokens(digest)).toBeLessThanOrEqual(2000);
    expect(digest).toContain('Сегодня: вт, 2026-11-10');
    expect(digest).toContain('ккал');
    expect(digest).not.toMatch(/\b(64|168|32)\s*(кг|см|лет|год)/);
    expect(digest).not.toMatch(/аллерги/i);
  });

  it('drops numbers with deemphasizeNumbers', () => {
    const quiet = fixtureEnv({
      overrides: {
        health: {
          flags: ['eatingDisorderHistory'],
          pregnancy: 'none',
          lactation: 'none',
          custom: [],
        },
      },
    });
    const digest = buildDigest(quiet.env);
    expect(quiet.env.engine.profile.safety.deemphasizeNumbers).toBe(true);
    expect(digest).not.toContain('ккал');
    expect(digest).toContain('deemphasizeNumbers=да');
  });
});
