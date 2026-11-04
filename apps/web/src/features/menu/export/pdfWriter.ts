import { zlibSync } from 'fflate';
import type { TrueType } from './ttf';

/**
 * A small PDF 1.7 writer for the menu export: A4 pages, text in embedded TrueType fonts (Type0 / Identity-H with a
 * ToUnicode map — the text stays selectable and searchable), filled and rounded rectangles, lines. Coordinates are in
 * points from the top-left corner of the page.
 */

export const A4 = { width: 595.28, height: 841.89 } as const;

export type FontName = 'regular' | 'bold';
export type Rgb = readonly [number, number, number];

export const hexColor = (hex: string): Rgb => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const NBSP = 0xa0;
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = (c: Rgb) => c.map(num).join(' ');
const hex4 = (n: number) => n.toString(16).padStart(4, '0');

/** UTF-16BE hex of a code point (surrogate pairs above the BMP). */
function utf16(codePoint: number): string {
  if (codePoint <= 0xffff) return hex4(codePoint);
  const v = codePoint - 0x10000;
  return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff));
}

export class PdfWriter {
  private readonly pages: string[][] = [];
  private readonly used: Record<FontName, Map<number, number>> = {
    regular: new Map(),
    bold: new Map(),
  };

  constructor(
    private readonly fonts: Readonly<Record<FontName, TrueType>>,
    private readonly title: string,
  ) {
    this.addPage();
  }

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): void {
    this.pages.push([]);
  }

  private get ops(): string[] {
    const page = this.pages.at(-1);
    if (!page) throw new Error('pdf: no page');
    return page;
  }

  private glyph(font: FontName, codePoint: number): number {
    const tt = this.fonts[font];
    const point = codePoint === NBSP ? 0x20 : codePoint;
    const glyph = tt.glyphOf(point);
    this.used[font].set(glyph, point);
    return glyph;
  }

  /** Width of a text in points. */
  width(text: string, font: FontName, size: number): number {
    const tt = this.fonts[font];
    let units = 0;
    for (const char of text) {
      const point = char.codePointAt(0) ?? 0x20;
      units += tt.advance(tt.glyphOf(point === NBSP ? 0x20 : point));
    }
    return (units / tt.unitsPerEm) * size;
  }

  /** Text with its baseline at `y` (from the top of the page). */
  text(text: string, x: number, y: number, font: FontName, size: number, color: Rgb): void {
    let hex = '';
    for (const char of text) hex += hex4(this.glyph(font, char.codePointAt(0) ?? 0x20));
    this.ops.push(
      `BT ${rgb(color)} rg /${font === 'bold' ? 'F2' : 'F1'} ${num(size)} Tf ${num(x)} ${num(A4.height - y)} Td <${hex}> Tj ET`,
    );
  }

  /** Words over lines no wider than `maxWidth` (a word longer than a line stays whole). */
  wrap(text: string, font: FontName, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && this.width(next, font, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb, radius = 0): void {
    const top = A4.height - y;
    const bottom = top - h;
    if (radius <= 0) {
      this.ops.push(`${rgb(color)} rg ${num(x)} ${num(bottom)} ${num(w)} ${num(h)} re f`);
      return;
    }
    const r = Math.min(radius, w / 2, h / 2);
    const k = r * 0.5523;
    const right = x + w;
    this.ops.push(
      [
        `${rgb(color)} rg`,
        `${num(x + r)} ${num(top)} m`,
        `${num(right - r)} ${num(top)} l`,
        `${num(right - r + k)} ${num(top)} ${num(right)} ${num(top - r + k)} ${num(right)} ${num(top - r)} c`,
        `${num(right)} ${num(bottom + r)} l`,
        `${num(right)} ${num(bottom + r - k)} ${num(right - r + k)} ${num(bottom)} ${num(right - r)} ${num(bottom)} c`,
        `${num(x + r)} ${num(bottom)} l`,
        `${num(x + r - k)} ${num(bottom)} ${num(x)} ${num(bottom + r - k)} ${num(x)} ${num(bottom + r)} c`,
        `${num(x)} ${num(top - r)} l`,
        `${num(x)} ${num(top - r + k)} ${num(x + r - k)} ${num(top)} ${num(x + r)} ${num(top)} c`,
        'f',
      ].join(' '),
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.75): void {
    this.ops.push(
      `${num(width)} w ${rgb(color)} RG ${num(x1)} ${num(A4.height - y1)} m ${num(x2)} ${num(A4.height - y2)} l S`,
    );
  }

  build(): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let size = 0;
    const write = (part: string | Uint8Array) => {
      const bytes = typeof part === 'string' ? encoder.encode(part) : part;
      chunks.push(bytes);
      size += bytes.length;
    };
    let count = 0;
    const reserve = () => {
      count += 1;
      return count;
    };
    const object = (id: number, body: string) => {
      offsets[id] = size;
      write(`${String(id)} 0 obj\n${body}\nendobj\n`);
    };
    const stream = (id: number, dict: string, data: Uint8Array) => {
      offsets[id] = size;
      write(`${String(id)} 0 obj\n<< ${dict} /Length ${String(data.length)} >>\nstream\n`);
      write(data);
      write('\nendstream\nendobj\n');
    };

    write('%PDF-1.7\n%âãÏÓ\n');
    const catalogId = reserve();
    const pagesId = reserve();
    const infoId = reserve();
    const fontIds = { regular: this.fontObjects(reserve), bold: this.fontObjects(reserve) };
    const pageIds = this.pages.map(() => ({ page: reserve(), content: reserve() }));

    object(catalogId, `<< /Type /Catalog /Pages ${String(pagesId)} 0 R >>`);
    object(
      pagesId,
      `<< /Type /Pages /Count ${String(pageIds.length)} /Kids [${pageIds.map((p) => `${String(p.page)} 0 R`).join(' ')}] >>`,
    );
    let titleHex = 'feff';
    for (const char of this.title) titleHex += utf16(char.codePointAt(0) ?? 0x20);
    object(infoId, `<< /Title <${titleHex}> /Producer (ProLanch) >>`);

    for (const name of ['regular', 'bold'] as const) {
      const ids = fontIds[name];
      const tt = this.fonts[name];
      const scale = 1000 / tt.unitsPerEm;
      const base = name === 'bold' ? 'OpenRunde-Bold' : 'OpenRunde-Regular';
      const glyphs = [...this.used[name].keys()].sort((a, b) => a - b);
      object(
        ids.type0,
        `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${String(ids.cid)} 0 R] /ToUnicode ${String(ids.toUnicode)} 0 R >>`,
      );
      object(
        ids.cid,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${String(ids.descriptor)} 0 R /CIDToGIDMap /Identity /DW 500 /W [${glyphs.map((g) => `${String(g)} [${String(Math.round(tt.advance(g) * scale))}]`).join(' ')}] >>`,
      );
      object(
        ids.descriptor,
        `<< /Type /FontDescriptor /FontName /${base} /Flags 32 /FontBBox [${tt.bbox.map((v) => String(Math.round(v * scale))).join(' ')}] /ItalicAngle 0 /Ascent ${String(Math.round(tt.ascent * scale))} /Descent ${String(Math.round(tt.descent * scale))} /CapHeight ${String(Math.round(tt.capHeight * scale))} /StemV ${name === 'bold' ? '120' : '80'} /FontFile2 ${String(ids.file)} 0 R >>`,
      );
      stream(
        ids.file,
        `/Filter /FlateDecode /Length1 ${String(tt.bytes.length)}`,
        zlibSync(tt.bytes),
      );
      const map = glyphs
        .map((g) => `<${hex4(g)}> <${utf16(this.used[name].get(g) ?? 0x20)}>`)
        .join('\n');
      const cmap = [
        '/CIDInit /ProcSet findresource begin',
        '12 dict begin',
        'begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
        '/CMapName /Adobe-Identity-UCS def',
        '/CMapType 2 def',
        '1 begincodespacerange',
        '<0000> <ffff>',
        'endcodespacerange',
        // At most 100 entries per block (PDF 32000 §9.10.3).
        ...chunked(map.split('\n'), 100).map(
          (block) => `${String(block.length)} beginbfchar\n${block.join('\n')}\nendbfchar`,
        ),
        'endcmap',
        'CMapName currentdict /CMap defineresource pop',
        'end',
        'end',
      ].join('\n');
      stream(ids.toUnicode, '/Filter /FlateDecode', zlibSync(encoder.encode(cmap)));
    }

    this.pages.forEach((ops, i) => {
      const ids = pageIds[i];
      if (!ids) return;
      object(
        ids.page,
        `<< /Type /Page /Parent ${String(pagesId)} 0 R /MediaBox [0 0 ${num(A4.width)} ${num(A4.height)}] /Resources << /Font << /F1 ${String(fontIds.regular.type0)} 0 R /F2 ${String(fontIds.bold.type0)} 0 R >> >> /Contents ${String(ids.content)} 0 R >>`,
      );
      stream(ids.content, '/Filter /FlateDecode', zlibSync(encoder.encode(ops.join('\n'))));
    });

    const xref = size;
    write(`xref\n0 ${String(count + 1)}\n0000000000 65535 f \n`);
    for (let id = 1; id <= count; id += 1)
      write(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`);
    write(
      `trailer\n<< /Size ${String(count + 1)} /Root ${String(catalogId)} 0 R /Info ${String(infoId)} 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`,
    );

    const out = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }

  private fontObjects(reserve: () => number) {
    return {
      type0: reserve(),
      cid: reserve(),
      descriptor: reserve(),
      file: reserve(),
      toUnicode: reserve(),
    };
  }
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
