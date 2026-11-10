/**
 * The context digest (ТЗ 07 §4.3): what Kiki knows about the person's menu without asking — built in the browser,
 * ≤ 2k tokens, numbers from the engine. Privacy minimisation: no age, height, weight, health flags, pregnancy or
 * screening answers, no names; exclusions are neutral «не использовать» (never «аллергия» — the person says that
 * themselves if they want to). With `deemphasizeNumbers` the digest carries no calories or grams at all.
 */
import { CATEGORIES, totals, drinking, type IsoDate } from '@refectorio/menu-core';
import { estimateTokens } from '../messages';
import { weekdayRu, type ToolEnv } from './tools';

export type UiState = {
  readonly selectedDate?: IsoDate;
  readonly openItemId?: string;
  readonly openPreviewId?: string;
  /** Where the person is: the menu page or the full-screen chat on a phone. */
  readonly screen?: 'menu' | 'chat';
};

export const DIGEST_MAX_TOKENS = 2000;

const GOAL_RU: Record<string, string> = {
  lose: 'снижение веса',
  maintain: 'поддержание веса',
  gain: 'набор веса',
  habits: 'здоровые привычки',
};
const DIET_RU: Record<string, string> = {
  omnivore: 'всеядное',
  pescatarian: 'пескетарианское',
  vegetarianLactoOvo: 'вегетарианское',
  vegan: 'веганское',
};
const MEAL_SHORT: Record<string, string> = { breakfast: 'З', lunch: 'О', dinner: 'У', snack: 'П' };

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const n = (v: number | null | undefined) => (v == null ? '—' : nf.format(Math.round(v)));

export function buildDigest(env: ToolEnv, ui: UiState = {}): string {
  const { plan, engine, today } = env;
  const profile = engine.profile;
  const s = profile.safety;
  const quiet = s.deemphasizeNumbers;
  const t = plan.targets;
  const lines: string[] = [];
  const answers = env.answers as { body?: { mode?: string } };
  const audience = answers.body?.mode === 'family' ? 'family' : s.ageYears < 18 ? 'teen' : 'adult';

  lines.push(`Сегодня: ${weekdayRu(today)}, ${today}.`);
  const where: string[] = [];
  if (ui.screen === 'chat') where.push('открыт чат');
  if (ui.selectedDate) where.push(`выбран день ${weekdayRu(ui.selectedDate)} ${ui.selectedDate}`);
  if (ui.openItemId)
    where.push(
      `открыто блюдо «${env.items.get(ui.openItemId)?.nameRu ?? ui.openItemId}» [${ui.openItemId}]`,
    );
  if (ui.openPreviewId) where.push(`открыт предпросмотр ${ui.openPreviewId}`);
  if (where.length > 0) lines.push(`Экран: ${where.join('; ')}.`);

  lines.push(
    `Цель: ${GOAL_RU[profile.goal] ?? profile.goal}. Питание: ${DIET_RU[s.diet] ?? s.diet}.`,
  );
  lines.push(
    `Флаги: audience=${audience}; deemphasizeNumbers=${quiet ? 'да' : 'нет'}; noWeightGoals=${
      profile.decision.allowedGoals.includes('lose') ? 'нет' : 'да'
    }.`,
  );
  if (!quiet)
    lines.push(
      `Цели на день: ${n(t.energyKcal)} ккал; белок ${n(t.proteinG.target)} г (${n(t.proteinG.min)}–${n(
        t.proteinG.max,
      )} г); жиры ${n(t.fatG.target)} г; углеводы ${n(t.carbsG.target)} г; клетчатка от ${n(
        t.fibreG.min,
      )} г; соль до ${nf.format(Math.round((t.sodiumMaxMg * 2.5) / 100) / 10)} г; кофеин до ${n(
        t.caffeineMaxMg,
      )} мг.`,
    );

  const notUse = [
    ...[...s.allergens.keys()].map((a) => `аллерген ${a}`),
    ...[...s.excluded.categories].map((c) => CATEGORIES[c].labelRu),
    ...[...s.excluded.ingredientIds].map((i) => env.ingredients.get(i) ?? i),
    ...[...s.excluded.itemIds].map((i) => env.items.get(i)?.nameRu ?? i),
  ];
  if (notUse.length > 0) lines.push(`Не использовать: ${notUse.join(', ')}.`);
  lines.push(`Приёмы пищи: ${plan.structure.map((m) => `${m.titleRu} [${m.id}]`).join(', ')}.`);
  const rules = plan.rules.filter((r) => r.active);
  if (rules.length > 0)
    lines.push(`Правила меню: ${rules.map((r) => `«${r.textRu}» [${r.id}]`).join('; ')}.`);

  const todayPlan = plan.days.find((d) => d.date === today);
  if (todayPlan && !quiet) {
    const tracking = env.tracking.days[today];
    const eaten = totals(todayPlan, { eatenOnly: true, ...(tracking ? { tracking } : {}) });
    const water = drinking(todayPlan, t, tracking);
    lines.push(
      `Сегодня отмечено: ${n(eaten.energyKcal)} из ${n(t.energyKcal)} ккал; вода ${n(
        water.drunkMl,
      )} из ${n(water.targetMl)} мл.`,
    );
  }

  const week = plan.days.filter((d) => d.date >= today).slice(0, 7);
  lines.push(
    quiet
      ? 'Меню (блюдо [id]):'
      : 'Меню (блюдо [id] ккал/белок г; З — завтрак, О — обед, У — ужин, П — перекус):',
  );
  for (const day of week) {
    const meals = plan.structure.map((m) => {
      const items = (day.meals[m.id] ?? []).map((item) => {
        const name = env.items.get(item.itemId)?.nameRu ?? item.itemId;
        return quiet
          ? `${name} [${item.itemId}]`
          : `${name} [${item.itemId}] ${n(item.nutrients.energyKcal)}/${n(item.nutrients.proteinG)}`;
      });
      return `${MEAL_SHORT[m.kind] ?? m.kind}${m.kind === 'snack' ? m.id.replace(/\D/g, '') : ''}: ${items.join('; ') || '—'}`;
    });
    const total = quiet ? '' : ` (итого ${n(day.totals.energyKcal)} ккал)`;
    lines.push(`${weekdayRu(day.date)} ${day.date.slice(5)}${total} · ${meals.join(' · ')}`);
  }

  let digest = lines.join('\n');
  // The week is the only long part: drop days from the end until the digest fits its budget.
  while (estimateTokens(digest) > DIGEST_MAX_TOKENS && lines.length > 1) {
    lines.pop();
    digest = lines.join('\n');
  }
  return digest;
}
