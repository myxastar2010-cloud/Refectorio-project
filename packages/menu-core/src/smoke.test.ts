import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { buildMenuProfile } from './profile';
import { quizAnswers, testFoods } from './testing';

describe('smoke', () => {
  it('builds a plan for an office worker', () => {
    const foods = testFoods();
    const profile = buildMenuProfile(quizAnswers(), { foods });
    if (!profile.ok) throw new Error(JSON.stringify(profile.error));
    const t0 = performance.now();
    const result = generate({ profile: profile.value, foods, today: '2026-11-04', seed: 7 });
    const ms = performance.now() - t0;
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const plan = result.value.plan;
    const name = (id: string) => foods.byId.get(id)?.nameRu ?? id;
    const lines = plan.days
      .slice(0, 3)
      .map(
        (d) =>
          `${d.date} ${Math.round(d.totals.energyKcal ?? 0)}kcal P${Math.round(d.totals.proteinG ?? 0)} F${Math.round(d.totals.fatG ?? 0)} C${Math.round(d.totals.carbsG ?? 0)} fib${Math.round(d.totals.fibreG ?? 0)} Na${Math.round(d.totals.sodiumMg ?? 0)} flags:${d.flags.map((f) => f.code).join(',')}\n` +
          plan.structure
            .map(
              (m) =>
                `  ${m.titleRu}: ${(d.meals[m.id] ?? []).map((i) => `${name(i.itemId)}×${i.portion.factor}`).join(' · ')}`,
            )
            .join('\n'),
      );
    console.log(
      `target ${Math.round(plan.targets.energyKcal)} kcal, P≥${Math.round(plan.targets.proteinG.min)}; ${plan.days.length} days in ${Math.round(ms)} ms; cost ${result.value.stats.finalCost.toFixed(2)} acc ${result.value.stats.accepted}/${result.value.stats.iterations} ${JSON.stringify(Object.fromEntries(Object.entries(result.value.stats.breakdown).map(([k, v]) => [k, Math.round(v * 10) / 10])))}\n${lines.join('\n')}\nnotes: ${plan.notes.map((n) => n.code).join(',')}`,
    );
    expect(plan.days.length).toBeGreaterThanOrEqual(8);
  });
});
