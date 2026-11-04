import type { QuizAnswersV1 } from '@refectorio/contracts';
import { addDays, compareDates, weekStart, type MealKind, type Plan } from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';
import type { Catalog } from '../data/catalog';
import { portionText } from '../data/portion';
import { goalText } from '../top/goal';
import { dayMonth, weekdayShort } from '../week/dates';

/** What every download of the week is made from (ТЗ фаза 4 §10): the plan's own numbers, nothing recomputed. */
export type ExportModel = {
  readonly title: string;
  /** «21–27 июля 2026». */
  readonly weekLabel: string;
  /** «ПроЛанч — меню 21–27 июля 2026» (no extension). */
  readonly fileBase: string;
  readonly goal: string;
  /** False with `deemphasizeNumbers`: no calories anywhere. */
  readonly numbers: boolean;
  readonly targetKcal: number;
  readonly days: readonly ExportDay[];
  /** The week's ingredients, raw grams summed by ingredient. */
  readonly shopping: readonly { readonly name: string; readonly grams: number }[];
  readonly footer: string;
};

export type ExportDay = {
  readonly date: string;
  /** «Пн, 21 июля». */
  readonly label: string;
  readonly kcal: number | null;
  readonly meals: readonly ExportMeal[];
};

export type ExportMeal = {
  readonly id: string;
  readonly kind: MealKind;
  readonly title: string;
  readonly items: readonly {
    readonly name: string;
    readonly portion: string;
    readonly kcal: number | null;
  }[];
};

export type ExportInput = {
  readonly plan: Plan;
  readonly catalog: Catalog;
  readonly answers: QuizAnswersV1 | null;
  /** Any day of the week to export. */
  readonly date: string;
};

const months = menu.week.monthsGenitive;
const parts = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return { year: y ?? 0, month: (m ?? 1) - 1, day: d ?? 1 };
};

/** «21–27 июля 2026», «28 июля – 3 августа 2026», «29 декабря 2026 – 4 января 2027». */
export function rangeLabel(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (a.year !== b.year)
    return `${String(a.day)} ${months[a.month] ?? ''} ${String(a.year)} – ${String(b.day)} ${months[b.month] ?? ''} ${String(b.year)}`;
  if (a.month !== b.month)
    return `${String(a.day)} ${months[a.month] ?? ''} – ${String(b.day)} ${months[b.month] ?? ''} ${String(b.year)}`;
  return `${String(a.day)}–${String(b.day)} ${months[b.month] ?? ''} ${String(b.year)}`;
}

export function exportModel({ plan, catalog, answers, date }: ExportInput): ExportModel {
  const numbers = !(answers?.guardrails.deemphasizeNumbers ?? false);
  const from = weekStart(date);
  const to = addDays(from, 6);
  const structure = [...plan.structure].sort((a, b) => a.order - b.order);
  const shopping = new Map<string, { name: string; grams: number }>();
  const days = plan.days
    .filter((d) => compareDates(d.date, from) >= 0 && compareDates(d.date, to) <= 0)
    .map((day): ExportDay => {
      const meals = structure.map((meal): ExportMeal => {
        const items = (day.meals[meal.id] ?? []).flatMap((item) => {
          const view = catalog.get(item.itemId);
          if (!view) return [];
          for (const ingredient of view.ingredients) {
            const known = shopping.get(ingredient.id);
            const grams = ingredient.g * item.portion.factor;
            if (known) known.grams += grams;
            else shopping.set(ingredient.id, { name: ingredient.nameRu, grams });
          }
          return [
            {
              name: view.nameRu,
              portion: portionText(view, item),
              kcal: numbers ? item.nutrients.energyKcal : null,
            },
          ];
        });
        return { id: meal.id, kind: meal.kind, title: meal.titleRu, items };
      });
      return {
        date: day.date,
        label: `${weekdayShort(day.date)}, ${dayMonth(day.date)}`,
        kcal: numbers ? day.totals.energyKcal : null,
        meals,
      };
    });
  const weekLabel = rangeLabel(from, to);
  return {
    title: menu.export.title,
    weekLabel,
    fileBase: `${menu.export.fileName} ${weekLabel}`,
    goal: goalText(answers),
    numbers,
    targetKcal: plan.targets.energyKcal,
    days,
    shopping: [...shopping.values()]
      .map((s) => ({ name: s.name, grams: Math.round(s.grams) }))
      .filter((s) => s.grams > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    footer: menu.export.footer,
  };
}
