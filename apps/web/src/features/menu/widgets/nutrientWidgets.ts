import type { QuizAnswersV1 } from '@refectorio/contracts';
import { SALT_PER_SODIUM, type NutrientKey } from '@refectorio/food-data';
import {
  addDays,
  markKey,
  weekStart,
  type DayTargets,
  type Plan,
  type Tracking,
} from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';
import { unitOf, type Unit } from '../details/facts';
import type { WidgetConfig } from '../store/schema';

/**
 * Custom widgets (ТЗ фаза 4 §5): any nutrient of the data against the person's norm — eaten (marked) amounts only,
 * from the plan's own nutrients. A limit (salt, saturated fat, added sugar, caffeine) is shown as «of the limit».
 */

export const WIDGET_GROUPS = {
  macros: ['proteinG', 'fatG', 'satFatG', 'carbsG'],
  vitamins: [
    'vitaminAUg',
    'vitaminCMg',
    'vitaminDUg',
    'vitaminEMg',
    'vitaminKUg',
    'thiaminMg',
    'riboflavinMg',
    'niacinMg',
    'vitaminB6Mg',
    'folateUgDfe',
    'vitaminB12Ug',
  ],
  minerals: [
    'calciumMg',
    'ironMg',
    'magnesiumMg',
    'phosphorusMg',
    'potassiumMg',
    'zincMg',
    'seleniumUg',
    'iodineUg',
  ],
  other: ['fibreG', 'addedSugarsG', 'sodiumMg', 'caffeineMg', 'alaG', 'epaDhaG'],
} as const satisfies Record<string, readonly NutrientKey[]>;

export type WidgetGroup = keyof typeof WIDGET_GROUPS;

/** The widget's name: the nutrient's, sodium as salt. */
export const widgetName = (key: NutrientKey) =>
  key === 'sodiumMg' ? menu.widgets.custom.salt : menu.nutrients[key];

/**
 * «Рекомендуем» (ТЗ фаза 4 §5): vegans — B12, iron, calcium, vitamin D, omega-3 (ALA), iodine; women 19–50 — iron;
 * 65+ — vitamin D, B12, calcium; strength training or fitness — protein; the sleep goal — caffeine; a plan with
 * low-fibre days — fibre.
 */
export function recommended(answers: QuizAnswersV1 | null, plan: Plan): NutrientKey[] {
  if (!answers) return [];
  const out: NutrientKey[] = [];
  const add = (...keys: NutrientKey[]) => {
    for (const key of keys) if (!out.includes(key)) out.push(key);
  };
  const { ageYears, sex } = answers.body;
  if (answers.diet === 'vegan')
    add('vitaminB12Ug', 'ironMg', 'calciumMg', 'vitaminDUg', 'alaG', 'iodineUg');
  if (sex === 'female' && ageYears >= 19 && ageYears <= 50) add('ironMg');
  if (ageYears >= 65) add('vitaminDUg', 'vitaminB12Ug', 'calciumMg');
  const goals = answers.extraGoals ?? [];
  if (answers.activity.strengthTraining || goals.includes('fitness')) add('proteinG');
  if (goals.includes('sleep')) add('caffeineMg');
  if (plan.days.some((d) => d.flags.some((f) => f.code === 'fibreLow'))) add('fibreG');
  return out;
}

export type Target = { readonly amount: number; readonly kind: 'norm' | 'limit' };

/** The person's daily norm or limit for a nutrient, or null («нормы нет»). Salt is shown in grams. */
export function dailyTarget(key: NutrientKey, t: DayTargets): Target | null {
  switch (key) {
    case 'proteinG':
      return { amount: t.proteinG.target, kind: 'norm' };
    case 'fatG':
      return { amount: t.fatG.target, kind: 'norm' };
    case 'carbsG':
      return { amount: t.carbsG.target, kind: 'norm' };
    case 'fibreG':
      return { amount: t.fibreG.target, kind: 'norm' };
    case 'satFatG':
      return { amount: t.satFatMaxG, kind: 'limit' };
    case 'addedSugarsG':
      return { amount: t.freeSugarsMaxG, kind: 'limit' };
    case 'sodiumMg':
      return { amount: (t.sodiumMaxMg * SALT_PER_SODIUM) / 1000, kind: 'limit' };
    case 'caffeineMg':
      return { amount: t.caffeineMaxMg, kind: 'limit' };
    case 'potassiumMg':
      return { amount: t.potassiumMinMg, kind: 'norm' };
    default: {
      const micro = t.micros[key];
      return micro ? { amount: micro.norm, kind: 'norm' } : null;
    }
  }
}

/** Salt (g) for sodium; every other nutrient in its own unit. */
export const widgetUnit = (key: NutrientKey): Unit => (key === 'sodiumMg' ? 'g' : unitOf(key));

export type WidgetValue = {
  /** Eaten amount; null — the marked dishes have no data for it. */
  readonly value: number | null;
  readonly target: Target | null;
  readonly unit: Unit;
};

/** Eaten amount of a widget's nutrient for the selected date (its day, one meal of it, or its week so far). */
export function widgetValue(
  widget: WidgetConfig,
  plan: Plan,
  tracking: Tracking,
  date: string,
): WidgetValue {
  const dates =
    widget.scope === 'week'
      ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i))
      : [date];
  let sum = 0;
  let known = 0;
  let eaten = 0;
  let days = 0;
  for (const d of dates) {
    const day = plan.days.find((p) => p.date === d);
    if (!day) continue;
    days += 1;
    const marks = tracking.days[d]?.eaten ?? {};
    for (const [mealId, items] of Object.entries(day.meals)) {
      if (widget.scope === 'meal' && mealId !== widget.mealId) continue;
      for (const item of items) {
        if (marks[markKey(mealId, item.itemId)] === undefined) continue;
        eaten += 1;
        const v = item.nutrients[widget.nutrient];
        if (v === null) continue;
        known += 1;
        sum += v;
      }
    }
  }
  const salt = widget.nutrient === 'sodiumMg';
  const daily = dailyTarget(widget.nutrient, plan.targets);
  const target =
    daily && widget.scope === 'week'
      ? { ...daily, amount: daily.amount * Math.max(1, days) }
      : daily;
  return {
    value: eaten > 0 && known === 0 ? null : salt ? (sum * SALT_PER_SODIUM) / 1000 : sum,
    target,
    unit: widgetUnit(widget.nutrient),
  };
}
