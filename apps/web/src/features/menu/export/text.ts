import type { MealKind } from '@refectorio/menu-core';
import { menu } from '../../../content/menu.ru';
import { fill, formatWhole } from '../../../lib/format';
import type { ExportMeal, ExportModel } from './model';

const NBSP = String.fromCharCode(0xa0);
const plain = (text: string) => text.split(NBSP).join(' ');

/** A readable list (TXT): the week by day and meal, then the shopping list. */
export function toTxt(model: ExportModel): string {
  const lines = [`${model.title} — ${model.weekLabel}`, model.goal, ''];
  for (const day of model.days) {
    lines.push(
      day.kcal === null
        ? day.label
        : `${day.label} · ${fill(menu.export.dayKcal, { n: formatWhole(day.kcal) })}`,
    );
    for (const meal of day.meals) {
      if (meal.items.length === 0) continue;
      lines.push(`  ${meal.title}`);
      for (const item of meal.items) {
        const kcal =
          item.kcal === null ? '' : `, ${fill(menu.export.dayKcal, { n: formatWhole(item.kcal) })}`;
        lines.push(`    • ${item.name} — ${item.portion}${kcal}`);
      }
    }
    lines.push('');
  }
  lines.push(menu.export.shopping);
  for (const s of model.shopping) lines.push(`  • ${s.name} — ${formatWhole(s.grams)} г`);
  lines.push('', model.footer);
  return plain(lines.join('\r\n'));
}

/** Rows of the week table, shared by CSV and XLSX: date, day, meal, dish, portion, kcal (null — hidden). */
export function weekRows(model: ExportModel): (string | number | null)[][] {
  const rows: (string | number | null)[][] = [];
  for (const day of model.days)
    for (const meal of day.meals)
      for (const item of meal.items)
        rows.push([day.date, day.label, meal.title, item.name, item.portion, item.kcal]);
  return rows;
}

export function weekHeader(model: ExportModel): string[] {
  const c = menu.export.columns;
  return [c.date, c.day, c.meal, c.dish, c.portion, ...(model.numbers ? [c.kcal] : [])];
}

const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : typeof value === 'number' ? String(Math.round(value)) : value;
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** CSV for Excel with Russian settings: «;» between cells, a BOM so the Cyrillic opens right. */
export function toCsv(model: ExportModel): string {
  const rows = weekRows(model).map((row) => (model.numbers ? row : row.slice(0, 5)));
  return (
    '\ufeff' +
    [weekHeader(model), ...rows]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n')
      .split(NBSP)
      .join(' ') +
    '\r\n'
  );
}

/** Default times of the meals (ТЗ фаза 4 §10): 08:00 / 13:00 / 19:00; snacks between their neighbours. */
const MAIN_MINUTES: Readonly<Record<Exclude<MealKind, 'snack'>, number>> = {
  breakfast: 8 * 60,
  lunch: 13 * 60,
  dinner: 19 * 60,
};
const SNACK_BEFORE_ALL = 7 * 60;
const SNACK_AFTER_ALL = 21 * 60;
const MEAL_MINUTES = 30;

/** Minutes after midnight for each meal of the day, in its order. */
export function mealTimes(meals: readonly Pick<ExportMeal, 'kind'>[]): number[] {
  const fixed = meals.map((m) => (m.kind === 'snack' ? null : MAIN_MINUTES[m.kind]));
  return fixed.map((time, i) => {
    if (time !== null) return time;
    // A run of snacks shares the gap between the main meals around it.
    let start = i;
    while (start > 0 && fixed[start - 1] === null) start -= 1;
    let end = i;
    while (end < fixed.length - 1 && fixed[end + 1] === null) end += 1;
    const before = start > 0 ? (fixed[start - 1] ?? null) : null;
    const after = end < fixed.length - 1 ? (fixed[end + 1] ?? null) : null;
    const from = before ?? Math.min(SNACK_BEFORE_ALL, (after ?? SNACK_BEFORE_ALL) - 60);
    const to = after ?? Math.max(SNACK_AFTER_ALL, from + 60);
    const run = end - start + 1;
    const step = (to - from) / (run + 1);
    return Math.round((from + step * (i - start + 1)) / 15) * 15;
  });
}

const icsText = (text: string) =>
  plain(text)
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');

/** Lines longer than 75 octets are folded (RFC 5545 §3.1), never inside a UTF-8 character. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

const stamp = (date: string, minutes: number) =>
  `${date.replaceAll('-', '')}T${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}00`;

/** One event per meal at its default time, local («floating») time — the calendar's own time zone. */
export function toIcs(model: ExportModel, now: Date = new Date()): string {
  const dtstamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ПроЛанч//Меню//RU',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsText(`${model.title} — ${model.weekLabel}`)}`,
  ];
  for (const day of model.days) {
    const meals = day.meals.filter((m) => m.items.length > 0);
    const times = mealTimes(meals);
    meals.forEach((meal, i) => {
      const start = times[i] ?? MAIN_MINUTES.lunch;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${day.date}-${meal.id}@refectorio.onrender.com`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${stamp(day.date, start)}`,
        `DTEND:${stamp(day.date, start + MEAL_MINUTES)}`,
        `SUMMARY:${icsText(`${meal.title}: ${meal.items.map((it) => it.name).join(', ')}`)}`,
        `DESCRIPTION:${icsText(meal.items.map((it) => `${it.name} — ${it.portion}`).join('\n'))}`,
        'END:VEVENT',
      );
    });
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
