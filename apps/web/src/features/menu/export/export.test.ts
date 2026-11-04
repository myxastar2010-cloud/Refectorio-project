import type { MenuRequest, MenuResponse, Plan } from '@refectorio/menu-core';
import { strFromU8, unzipSync, unzlibSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import regularFont from '../../../assets/fonts/pdf/open-runde-400.ttf?inline';
import boldFont from '../../../assets/fonts/pdf/open-runde-700.ttf?inline';
import { quizAnswers } from '../../../../../../packages/menu-core/src/testing';
import type { Catalog } from '../data/catalog';
import { handle } from '../engine/handler';
import { exportModel, rangeLabel, type ExportModel } from './model';
import { toPdf } from './pdf';
import { parseTrueType, type TrueType } from './ttf';
import { mealTimes, toCsv, toIcs, toTxt } from './text';
import { toXlsx } from './xlsx';

const TODAY = '2026-11-02';
const answers = quizAnswers();

let plan: Plan;
let catalog: Catalog;
let model: ExportModel;

function run(request: Record<string, unknown>): MenuResponse {
  const out: MenuResponse[] = [];
  handle({ id: 1, ...request } as MenuRequest, (r) => out.push(r));
  const last = out.at(-1);
  if (!last) throw new Error('no answer');
  return last;
}

/** The fonts come inlined as data URLs (Vite): no file system in the test. */
const font = (dataUrl: string): TrueType =>
  parseTrueType(Uint8Array.from(atob(dataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0)));

describe('menu export', () => {
  beforeAll(() => {
    const generated = run({ type: 'generate', answers, today: TODAY, seed: 7 });
    if (generated.type !== 'plan') throw new Error('no plan');
    plan = generated.plan;
    const items = run({ type: 'catalog' });
    if (items.type !== 'catalog') throw new Error('no catalog');
    catalog = new Map(items.items.map((item) => [item.id, item]));
    model = exportModel({ plan, catalog, answers, date: TODAY });
  }, 30_000);

  it('the model: the week of the date, its dishes and a shopping list summed by ingredient', () => {
    expect(model.days.map((d) => d.date)[0]).toBe('2026-11-02');
    expect(model.days.length).toBeGreaterThan(0);
    expect(model.days.length).toBeLessThanOrEqual(7);
    expect(model.fileBase).toBe(`ПроЛанч — меню ${model.weekLabel}`);
    const dishes = model.days.flatMap((d) => d.meals.flatMap((m) => m.items));
    expect(dishes.every((dish) => dish.name.length > 0 && dish.portion.length > 0)).toBe(true);
    expect(model.shopping.length).toBeGreaterThan(5);
    expect(new Set(model.shopping.map((s) => s.name)).size).toBeLessThanOrEqual(
      model.shopping.length,
    );
    expect(model.shopping.every((s) => s.grams > 0)).toBe(true);
  });

  it('week labels across months and years', () => {
    expect(rangeLabel('2026-07-20', '2026-07-26')).toBe('20–26 июля 2026');
    expect(rangeLabel('2026-07-27', '2026-08-02')).toBe('27 июля – 2 августа 2026');
    expect(rangeLabel('2026-12-28', '2027-01-03')).toBe('28 декабря 2026 – 3 января 2027');
  });

  it('deemphasized numbers: no calories in the model, the CSV or the text', () => {
    const calm = exportModel({
      plan,
      catalog,
      answers: { ...answers, guardrails: { ...answers.guardrails, deemphasizeNumbers: true } },
      date: TODAY,
    });
    expect(calm.days.every((d) => d.kcal === null)).toBe(true);
    expect(toCsv(calm)).not.toContain('Ккал');
    expect(toTxt(calm)).not.toMatch(/ккал/);
  });

  it('meal times: 8 / 13 / 19 and snacks between their neighbours', () => {
    expect(mealTimes([{ kind: 'breakfast' }, { kind: 'lunch' }, { kind: 'dinner' }])).toEqual([
      480, 780, 1140,
    ]);
    expect(
      mealTimes([{ kind: 'breakfast' }, { kind: 'snack' }, { kind: 'lunch' }, { kind: 'dinner' }]),
    ).toEqual([480, 630, 780, 1140]);
    const late = mealTimes([
      { kind: 'breakfast' },
      { kind: 'lunch' },
      { kind: 'dinner' },
      { kind: 'snack' },
    ]);
    expect(late[3]).toBeGreaterThan(1140);
  });

  it('ICS: CRLF lines of ≤ 75 octets, one event per meal, escaped text', () => {
    const ics = toIcs(model, new Date('2026-11-02T09:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n'))
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const meals = model.days.reduce(
      (n, d) => n + d.meals.filter((m) => m.items.length > 0).length,
      0,
    );
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(meals);
    expect(ics.match(/END:VEVENT/g)?.length).toBe(meals);
    expect(ics).toMatch(/DTSTART:20261102T080000/);
    const unfolded = ics.replaceAll('\r\n ', '');
    expect(unfolded).not.toMatch(/SUMMARY:[^\r]*[^\\],[^\r]*\r\nDESCRIPTION:[^\r]*\n/);
  });

  it('CSV: BOM, «;» cells, a header and a row per dish', () => {
    const csv = toCsv(model);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = csv.slice(1).trimEnd().split('\r\n');
    expect(rows[0]).toBe('Дата;День;Приём пищи;Блюдо;Порция;Ккал');
    const dishes = model.days.flatMap((d) => d.meals.flatMap((m) => m.items));
    expect(rows).toHaveLength(dishes.length + 1);
  });

  it('XLSX: a zip with the workbook, both sheets and the dish names', () => {
    const files = unzipSync(toXlsx(model));
    expect(Object.keys(files).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
        'xl/worksheets/sheet2.xml',
      ].sort(),
    );
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'] ?? new Uint8Array());
    const first = model.days[0]?.meals.find((m) => m.items.length > 0)?.items[0]?.name ?? '';
    expect(sheet).toContain(first.replaceAll('&', '&amp;'));
    expect(strFromU8(files['xl/workbook.xml'] ?? new Uint8Array())).toContain('Покупки');
  });

  it('PDF: a valid xref, selectable text with the dish names and the shopping list', () => {
    const regular = font(regularFont);
    const bold = font(boldFont);
    const bytes = toPdf(model, { regular, bold });
    // One character per byte (TextDecoder's «latin1» is windows-1252 and would remap 0x80–0x9f).
    let text = '';
    for (let i = 0; i < bytes.length; i += 8192)
      text += String.fromCharCode(...bytes.subarray(i, i + 8192));
    expect(text.startsWith('%PDF-1.7')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // Every xref offset points at its object.
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    const entries = text.slice(xrefAt).split('\n').slice(3);
    entries.forEach((entry, i) => {
      if (!/^\d{10} 00000 n $/.test(entry)) return;
      expect(text.slice(Number(entry.slice(0, 10)), Number(entry.slice(0, 10)) + 12)).toMatch(
        new RegExp(`^${String(i + 1)} 0 obj`),
      );
    });
    // Read the pages back: glyph ids → characters through the fonts' own maps.
    const reverse = (tt: TrueType) => {
      const map = new Map<number, string>();
      const points = [
        ...Array.from({ length: 0x440 }, (_, i) => 0x20 + i),
        ...Array.from({ length: 0x2b }, (_, i) => 0x2010 + i),
      ];
      for (const cp of points) {
        const g = tt.glyphOf(cp);
        if (g && !map.has(g)) map.set(g, String.fromCodePoint(cp));
      }
      return map;
    };
    const maps = { F1: reverse(regular), F2: reverse(bold) };
    let pages = '';
    const streams = /stream\n([\s\S]*?)\nendstream/g;
    for (let m = streams.exec(text); m; m = streams.exec(text)) {
      const raw = Uint8Array.from(m[1] ?? '', (c) => c.charCodeAt(0));
      let content: string;
      try {
        content = strFromU8(unzlibSync(raw));
      } catch {
        continue;
      }
      for (const op of content.matchAll(
        /\/(F[12]) [\d.]+ Tf [\d.-]+ [\d.-]+ Td <([0-9a-f]*)> Tj/g,
      )) {
        const map = maps[op[1] as 'F1' | 'F2'];
        const hex = op[2] ?? '';
        let line = '';
        for (let i = 0; i < hex.length; i += 4)
          line += map.get(parseInt(hex.slice(i, i + 4), 16)) ?? '?';
        pages += `${line}\n`;
      }
    }
    const firstDish = model.days[0]?.meals.find((m) => m.items.length > 0)?.items[0]?.name ?? '';
    expect(pages).toContain(firstDish.split(' ')[0]);
    expect(pages).toContain('Список покупок на неделю');
    expect(pages).toContain(model.weekLabel);
  });
});
