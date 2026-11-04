import { menu } from '../../../content/menu.ru';
import { fill, formatWhole } from '../../../lib/format';
import type { ExportModel } from './model';

/** The site's palette (styles/tokens.css) for the picture. */
const BG = '#fef9f7';
const INK = '#000000';
const MUTED = '#5a5451';
const ACCENT = '#7d9c65';
const BEIGE = '#f2e4d8';
const FONT = '"Open Runde", system-ui, sans-serif';

/** Landscape for wide screens, portrait (a phone's story size) otherwise (ТЗ фаза 4 §10). */
export const IMAGE_SIZES = {
  landscape: { width: 1920, height: 1080, columns: 7 },
  portrait: { width: 1080, height: 1350, columns: 2 },
} as const;

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** A line cut to the width with «…». */
function fit(ctx: Ctx, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** Up to `max` wrapped lines, the last one cut with «…». */
function lines(ctx: Ctx, text: string, width: number, max: number): string[] {
  const out: string[] = [];
  let line = '';
  const words = text.split(' ');
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? '';
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      if (out.length === max - 1) {
        out.push(fit(ctx, words.slice(i - line.split(' ').length, words.length).join(' '), width));
        return out;
      }
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(fit(ctx, line, width));
  return out.slice(0, max);
}

/**
 * The week as a picture (Canvas 2D, not a screenshot): the brand header, a card per day with its meals and dishes,
 * day totals, the footer. Text that does not fit is cut with «…» — the PDF has everything.
 */
export async function toImage(
  model: ExportModel,
  orientation: keyof typeof IMAGE_SIZES,
  type: 'image/png' | 'image/jpeg',
): Promise<Blob> {
  await Promise.all(
    ['400', '600', '700'].map((w) => document.fonts.load(`${w} 24px "Open Runde"`).catch(() => [])),
  );
  const { width, height, columns } = IMAGE_SIZES[orientation];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas: no 2d context');
  const pad = orientation === 'landscape' ? 64 : 56;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // Header: the brand, the week and the goal.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ACCENT;
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(model.title, pad, pad + 56);
  ctx.fillStyle = INK;
  ctx.font = `700 40px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(model.weekLabel, width - pad, pad + 40);
  ctx.fillStyle = MUTED;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(model.goal, width - pad, pad + 80);
  ctx.textAlign = 'left';

  const top = pad + 120;
  const bottom = height - pad - 40;
  const gap = 20;
  const rows = Math.ceil(model.days.length / columns) || 1;
  const cardW = (width - pad * 2 - gap * (columns - 1)) / columns;
  const cardH = (bottom - top - gap * (rows - 1)) / rows;
  const inner = 24;
  const small = orientation === 'landscape' ? 21 : 22;

  model.days.forEach((day, i) => {
    const x = pad + (i % columns) * (cardW + gap);
    const y = top + Math.floor(i / columns) * (cardH + gap);
    roundRect(ctx, x, y, cardW, cardH, 36, BEIGE);
    ctx.fillStyle = INK;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(fit(ctx, day.label, cardW - inner * 2), x + inner, y + inner + 28);
    let cy = y + inner + 40;
    if (day.kcal !== null) {
      ctx.fillStyle = MUTED;
      ctx.font = `600 ${String(small)}px ${FONT}`;
      ctx.fillText(fill(menu.export.dayKcal, { n: formatWhole(day.kcal) }), x + inner, cy + 18);
      cy += 26;
    }
    const limit = y + cardH - inner;
    for (const meal of day.meals) {
      if (meal.items.length === 0) continue;
      if (cy + 52 > limit) break;
      cy += 34;
      ctx.fillStyle = ACCENT;
      ctx.font = `700 ${String(small + 1)}px ${FONT}`;
      ctx.fillText(fit(ctx, meal.title, cardW - inner * 2), x + inner, cy);
      ctx.fillStyle = INK;
      ctx.font = `500 ${String(small)}px ${FONT}`;
      for (const item of meal.items) {
        for (const line of lines(ctx, item.name, cardW - inner * 2, 2)) {
          if (cy + small + 8 > limit) break;
          cy += small + 6;
          ctx.fillText(line, x + inner, cy);
        }
      }
    }
  });

  ctx.fillStyle = MUTED;
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(model.footer, pad, height - pad + 6);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas: no blob'));
      },
      type,
      0.92,
    );
  });
}
