/**
 * The few TrueType tables the PDF export needs (Apple/Microsoft OpenType spec): units per em, vertical metrics, the
 * bounding box, advance widths and the character → glyph map (cmap formats 4 and 12).
 */
export type TrueType = {
  readonly bytes: Uint8Array;
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
  readonly bbox: readonly [number, number, number, number];
  /** Glyph id of a code point (0 — missing). */
  readonly glyphOf: (codePoint: number) => number;
  /** Advance width of a glyph, font units. */
  readonly advance: (glyph: number) => number;
};

export function parseTrueType(bytes: Uint8Array): TrueType {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map<string, number>();
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(at),
      view.getUint8(at + 1),
      view.getUint8(at + 2),
      view.getUint8(at + 3),
    );
    tables.set(tag, view.getUint32(at + 8));
  }
  const table = (tag: string) => {
    const at = tables.get(tag);
    if (at === undefined) throw new Error(`ttf: no ${tag} table`);
    return at;
  };

  const head = table('head');
  const unitsPerEm = view.getUint16(head + 18);
  const bbox = [
    view.getInt16(head + 36),
    view.getInt16(head + 38),
    view.getInt16(head + 40),
    view.getInt16(head + 42),
  ] as const;
  const hhea = table('hhea');
  const ascent = view.getInt16(hhea + 4);
  const descent = view.getInt16(hhea + 6);
  const metrics = view.getUint16(hhea + 34);
  const hmtx = table('hmtx');
  const os2 = tables.get('OS/2');
  const capHeight =
    os2 !== undefined && view.getUint16(os2) >= 2
      ? view.getInt16(os2 + 88)
      : Math.round(ascent * 0.7);

  const advance = (glyph: number) => view.getUint16(hmtx + Math.min(glyph, metrics - 1) * 4);

  // cmap: the Windows Unicode subtable — full range (format 12) if there is one, else BMP (format 4).
  const cmap = table('cmap');
  let format4: number | null = null;
  let format12: number | null = null;
  for (let i = 0; i < view.getUint16(cmap + 2); i += 1) {
    const at = cmap + 4 + i * 8;
    const platform = view.getUint16(at);
    const encoding = view.getUint16(at + 2);
    const sub = cmap + view.getUint32(at + 4);
    const format = view.getUint16(sub);
    if (format === 12 && (platform === 3 || platform === 0)) format12 = sub;
    if (format === 4 && ((platform === 3 && encoding === 1) || platform === 0)) format4 ??= sub;
  }

  const cache = new Map<number, number>();
  const glyphOf = (codePoint: number): number => {
    const known = cache.get(codePoint);
    if (known !== undefined) return known;
    let glyph = 0;
    if (format12 !== null) {
      const groups = view.getUint32(format12 + 12);
      for (let g = 0; g < groups; g += 1) {
        const at = format12 + 16 + g * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        if (codePoint >= start && codePoint <= end) {
          glyph = view.getUint32(at + 8) + codePoint - start;
          break;
        }
      }
    } else if (format4 !== null && codePoint <= 0xffff) {
      const segments = view.getUint16(format4 + 6) / 2;
      const ends = format4 + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const offsets = deltas + segments * 2;
      for (let s = 0; s < segments; s += 1) {
        if (codePoint > view.getUint16(ends + s * 2)) continue;
        const start = view.getUint16(starts + s * 2);
        if (codePoint < start) break;
        const delta = view.getInt16(deltas + s * 2);
        const rangeOffset = view.getUint16(offsets + s * 2);
        if (rangeOffset === 0) glyph = (codePoint + delta) & 0xffff;
        else {
          const at = offsets + s * 2 + rangeOffset + (codePoint - start) * 2;
          const raw = view.getUint16(at);
          glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
        }
        break;
      }
    }
    cache.set(codePoint, glyph);
    return glyph;
  };

  return { bytes, unitsPerEm, ascent, descent, capHeight, bbox, glyphOf, advance };
}
