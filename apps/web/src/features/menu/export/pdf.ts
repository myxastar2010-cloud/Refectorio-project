import { menu } from '../../../content/menu.ru';
import { fill, formatWhole } from '../../../lib/format';
import type { ExportModel } from './model';
import { A4, hexColor, PdfWriter, type FontName, type Rgb } from './pdfWriter';
import type { TrueType } from './ttf';

/** The site's palette (styles/tokens.css) for print. */
const INK = hexColor('#000000');
const MUTED = hexColor('#5a5451');
const ACCENT = hexColor('#7d9c65');
const BEIGE = hexColor('#f2e4d8');

const MARGIN = 36;
const GAP = 18;
const COLUMNS = 2;
const COLUMN_WIDTH = (A4.width - MARGIN * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const BOTTOM = A4.height - MARGIN - 18;

/**
 * Lines flowing down two columns and on to the next page; each page gets the footer. `need` keeps a heading together
 * with the first lines after it.
 */
class Flow {
  private column = 0;
  /** Where the columns of the current page start (below the header on the first page). */
  private columnTop: number;
  y: number;

  constructor(
    private readonly pdf: PdfWriter,
    private readonly model: ExportModel,
    top: number,
  ) {
    this.y = top;
    this.columnTop = top;
    this.footer();
  }

  get x(): number {
    return MARGIN + this.column * (COLUMN_WIDTH + GAP);
  }

  need(height: number): void {
    if (this.y + height <= BOTTOM) return;
    if (this.column < COLUMNS - 1) this.column += 1;
    else {
      this.pdf.addPage();
      this.footer();
      this.column = 0;
      this.columnTop = MARGIN + 8;
    }
    this.y = this.columnTop;
  }

  /** A new page for the next part (the shopping list). */
  breakPage(top: number): void {
    this.pdf.addPage();
    this.footer();
    this.column = 0;
    this.columnTop = top;
    this.y = top;
  }

  private footer(): void {
    const page = this.pdf.pageCount;
    this.pdf.text(this.model.footer, MARGIN, A4.height - MARGIN + 6, 'regular', 7.5, MUTED);
    const label = String(page);
    this.pdf.text(
      label,
      A4.width - MARGIN - this.pdf.width(label, 'regular', 7.5),
      A4.height - MARGIN + 6,
      'regular',
      7.5,
      MUTED,
    );
  }

  /** Wrapped text at the column's left with an indent; returns the height used. */
  text(
    text: string,
    font: FontName,
    size: number,
    color: Rgb,
    indent = 0,
    lead = size * 1.32,
  ): void {
    for (const line of this.pdf.wrap(text, font, size, COLUMN_WIDTH - indent)) {
      this.need(lead);
      this.y += lead;
      this.pdf.text(line, this.x + indent, this.y - lead * 0.24, font, size, color);
    }
  }
}

export function toPdf(
  model: ExportModel,
  fonts: Readonly<Record<FontName, TrueType>>,
): Uint8Array<ArrayBuffer> {
  const pdf = new PdfWriter(fonts, `${model.title} — ${model.weekLabel}`);

  // The brand header of the first page.
  pdf.rect(MARGIN, MARGIN, A4.width - MARGIN * 2, 64, BEIGE, 18);
  pdf.text(model.title, MARGIN + 18, MARGIN + 30, 'bold', 22, ACCENT);
  pdf.text(menu.export.menuTitle, MARGIN + 18, MARGIN + 50, 'regular', 10, MUTED);
  const right = A4.width - MARGIN - 18;
  pdf.text(
    model.weekLabel,
    right - pdf.width(model.weekLabel, 'bold', 13),
    MARGIN + 28,
    'bold',
    13,
    INK,
  );
  pdf.text(
    model.goal,
    right - pdf.width(model.goal, 'regular', 10),
    MARGIN + 46,
    'regular',
    10,
    MUTED,
  );

  const flow = new Flow(pdf, model, MARGIN + 80);
  for (const day of model.days) {
    flow.need(64);
    flow.y += 18;
    pdf.text(day.label, flow.x, flow.y, 'bold', 12, INK);
    if (day.kcal !== null) {
      const total = fill(menu.export.dayKcal, { n: formatWhole(day.kcal) });
      pdf.text(
        total,
        flow.x + COLUMN_WIDTH - pdf.width(total, 'regular', 9),
        flow.y,
        'regular',
        9,
        MUTED,
      );
    }
    flow.y += 6;
    pdf.line(flow.x, flow.y, flow.x + COLUMN_WIDTH, flow.y, BEIGE, 1);
    for (const meal of day.meals) {
      if (meal.items.length === 0) continue;
      flow.need(34);
      flow.y += 4;
      flow.text(meal.title, 'bold', 9.5, ACCENT);
      for (const item of meal.items) {
        flow.need(26);
        flow.text(item.name, 'regular', 9.5, INK, 8);
        const detail =
          item.kcal === null
            ? item.portion
            : `${item.portion} · ${fill(menu.export.dayKcal, { n: formatWhole(item.kcal) })}`;
        flow.text(detail, 'regular', 8, MUTED, 8, 11);
      }
    }
    flow.y += 6;
  }

  // The shopping list on a page of its own.
  flow.breakPage(MARGIN + 64);
  pdf.text(menu.export.shopping, MARGIN, MARGIN + 18, 'bold', 16, INK);
  pdf.text(model.weekLabel, MARGIN, MARGIN + 36, 'regular', 10, MUTED);
  pdf.text(menu.export.shoppingNote, MARGIN, MARGIN + 50, 'regular', 8.5, MUTED);
  for (const item of model.shopping) {
    const grams = `${formatWhole(item.grams)} г`;
    const gramsWidth = pdf.width(grams, 'bold', 9);
    const lines = pdf.wrap(item.name, 'regular', 9, COLUMN_WIDTH - gramsWidth - 12);
    flow.need(lines.length * 12 + 4);
    lines.forEach((line, i) => {
      flow.y += 12;
      pdf.text(line, flow.x, flow.y, 'regular', 9, INK);
      if (i === 0) pdf.text(grams, flow.x + COLUMN_WIDTH - gramsWidth, flow.y, 'bold', 9, INK);
    });
    flow.y += 4;
    pdf.line(flow.x, flow.y, flow.x + COLUMN_WIDTH, flow.y, BEIGE, 0.6);
  }
  return pdf.build();
}
