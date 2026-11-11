import { memo, type ReactNode } from 'react';
import { kiki } from '../../content/kiki.ru';

/**
 * Kiki's Markdown (ТЗ 07 §10): paragraphs, lists, bold, italics, inline code, links (new tab, `noopener noreferrer`,
 * http(s) and the site's own `#…` only) and tables (scroll sideways). No raw HTML ever: React escapes every string, so a
 * `<script>` in a reply is just text. Small on purpose — a chat reply is 1–4 sentences.
 */
type Block =
  | { readonly kind: 'p'; readonly lines: string[] }
  | { readonly kind: 'ul' | 'ol'; readonly items: string[] }
  | { readonly kind: 'table'; readonly head: string[]; readonly rows: string[][] }
  | { readonly kind: 'h'; readonly text: string };

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!line.trim()) {
      i++;
      continue;
    }
    const next = lines[i + 1] ?? '';
    if (line.includes('|') && TABLE_RULE.test(next)) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? '').includes('|')) rows.push(cells(lines[i++] ?? ''));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ kind: 'h', text: line.replace(/^#{1,6}\s+/, '') });
      i++;
      continue;
    }
    const list = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : null;
    if (list) {
      const re = list === 'ul' ? BULLET : NUMBERED;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i] ?? ''))
        items.push((lines[i++] ?? '').replace(re, ''));
      blocks.push({ kind: list, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !BULLET.test(lines[i] ?? '') &&
      !NUMBERED.test(lines[i] ?? '')
    )
      para.push(lines[i++] ?? '');
    blocks.push({ kind: 'p', lines: para });
  }
  return blocks;
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/;

function safeHref(href: string): string | null {
  if (href.startsWith('#')) return href;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(token.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(token.slice(1, -1), k)}</em>);
    else {
      const [, label = '', href = ''] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token) ?? [];
      const safe = safeHref(href);
      out.push(
        safe ? (
          <a
            key={k}
            href={safe}
            {...(safe.startsWith('#') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

/** Memoised: while Kiki streams, only the live message re-parses — the history keeps its rendered text. */
export const Markdown = memo(function Markdown({ text }: { readonly text: string }) {
  return (
    <>
      {parseBlocks(text).map((block, b) => {
        const key = `b${b}`;
        switch (block.kind) {
          case 'h':
            return (
              <p key={key} className="kiki-md-h">
                <strong>{inline(block.text, key)}</strong>
              </p>
            );
          case 'ul':
          case 'ol': {
            const List = block.kind;
            return (
              <List key={key}>
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{inline(item, `${key}-${i}`)}</li>
                ))}
              </List>
            );
          }
          case 'table':
            return (
              <div
                key={key}
                className="kiki-md-table"
                tabIndex={0}
                role="region"
                aria-label={kiki.table}
              >
                <table>
                  <thead>
                    <tr>
                      {block.head.map((c, i) => (
                        <th key={i} scope="col">
                          {inline(c, `${key}-h${i}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((c, i) => (
                          <td key={i}>{inline(c, `${key}-${r}-${i}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'p':
            return (
              <p key={key}>
                {block.lines.map((line, i) => (
                  <span key={i}>
                    {i > 0 ? <br /> : null}
                    {inline(line, `${key}-${i}`)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </>
  );
});
