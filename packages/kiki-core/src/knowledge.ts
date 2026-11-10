/**
 * Kiki's knowledge base (ТЗ 07 §9): the site guide (one doc per section) and short cited science cards, searched with
 * BM25 over Russian stems (R20 §3: ≤ 300 docs need no vector database; k1 = 1.2, b = 0.75 as Elasticsearch). The docs
 * are compiled from Markdown at build time (`scripts/kiki/knowledge.mjs` → `knowledge/kb.json`).
 */
import { tokenize } from '@refectorio/menu-core/text';
import { z } from 'zod';
import { estimateTokens } from './messages';

export const kbDocSchema = z.object({
  id: z.string().min(2).max(80),
  kind: z.enum(['guide', 'science']),
  title: z.string().min(2).max(160),
  tags: z.array(z.string()).max(30),
  sources: z.array(z.string()).max(20),
  text: z.string().min(10).max(4000),
});
export type KbDoc = z.infer<typeof kbDocSchema>;
export const kbFileSchema = z.object({ version: z.string(), docs: z.array(kbDocSchema).max(400) });
export type KbFile = z.infer<typeof kbFileSchema>;

export type KbHit = { readonly doc: KbDoc; readonly score: number };

const K1 = 1.2;
const B = 0.75;
/** Title and tags count more than body words: they name what the doc is about. */
const TITLE_BOOST = 3;
const TAG_BOOST = 2;

// Very common words carry no signal for retrieval («как», «мне», «в»).
const STOP = new Set(
  'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтобы без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это мое моё мои вашем ваш ваше'.split(
    ' ',
  ),
);

const stems = (text: string): string[] =>
  tokenize(text)
    .filter((t) => !STOP.has(t.word) && t.word.length > 1)
    .map((t) => t.stem);

type Indexed = { readonly doc: KbDoc; readonly tf: Map<string, number>; readonly length: number };

export type Kb = {
  readonly size: number;
  search(query: string, options?: { k?: number; minScore?: number }): KbHit[];
  /** Top hits that fit a token budget, as one context block (ТЗ 07 §4: ≤ 1.5k tokens). */
  context(query: string, maxTokens?: number): { text: string; ids: string[] };
};

export function createKb(file: KbFile): Kb {
  const indexed: Indexed[] = file.docs.map((doc) => {
    const tf = new Map<string, number>();
    const add = (words: string[], weight: number) => {
      for (const w of words) tf.set(w, (tf.get(w) ?? 0) + weight);
    };
    add(stems(doc.title), TITLE_BOOST);
    add(stems(doc.tags.join(' ')), TAG_BOOST);
    add(stems(doc.text), 1);
    let length = 0;
    for (const v of tf.values()) length += v;
    return { doc, tf, length };
  });
  const n = indexed.length;
  const avg = indexed.reduce((s, d) => s + d.length, 0) / Math.max(1, n);
  const df = new Map<string, number>();
  for (const d of indexed) for (const term of d.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  const idf = (term: string) => {
    const f = df.get(term) ?? 0;
    return Math.log(1 + (n - f + 0.5) / (f + 0.5));
  };

  const search: Kb['search'] = (query, options = {}) => {
    const { k = 4, minScore = 1.5 } = options;
    const terms = [...new Set(stems(query))];
    if (terms.length === 0) return [];
    const hits: KbHit[] = [];
    for (const d of indexed) {
      let score = 0;
      for (const term of terms) {
        const f = d.tf.get(term);
        if (!f) continue;
        score += (idf(term) * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * d.length) / avg));
      }
      if (score >= minScore) hits.push({ doc: d.doc, score });
    }
    return hits.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id)).slice(0, k);
  };

  return {
    size: n,
    search,
    context(query, maxTokens = 1500) {
      const parts: string[] = [];
      const ids: string[] = [];
      let used = 0;
      for (const hit of search(query, { k: 5 })) {
        const block = formatDoc(hit.doc);
        const cost = estimateTokens(block);
        if (used + cost > maxTokens) continue;
        parts.push(block);
        ids.push(hit.doc.id);
        used += cost;
      }
      return { text: parts.join('\n\n'), ids };
    },
  };
}

/** A content hash (FNV-1a over the docs) — the version changes only when the knowledge does. */
export function stableKbVersion(docs: readonly KbDoc[]): string {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(docs)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `kb-${h.toString(16).padStart(8, '0')}`;
}

export function formatDoc(doc: KbDoc): string {
  const sources = doc.sources.length > 0 ? `\n(Источники: ${doc.sources.join('; ')})` : '';
  return `### ${doc.title} [${doc.kind}:${doc.id}]\n${doc.text}${sources}`;
}

/**
 * Markdown → docs. The guide: one doc per `## <id> · <title>` section. A science card: front matter (`id`, `title`,
 * `tags`, `sources`) + body.
 */
export function parseGuide(markdown: string): KbDoc[] {
  const docs: KbDoc[] = [];
  const sections = markdown.split(/^## /m).slice(1);
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const heading = section.slice(0, newline).trim();
    const body = section.slice(newline + 1).trim();
    const [id, title] = heading.split(/\s+·\s+/);
    if (!id || !title || !body) continue;
    docs.push({ id: `guide-${id}`, kind: 'guide', title, tags: [], sources: [], text: body });
  }
  return docs;
}

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^["'«]|["'»]$/g, ''))
    .filter(Boolean);

export function parseCard(markdown: string): KbDoc | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(markdown.trim());
  if (!m?.[1] || !m[2]) return null;
  const meta = new Map<string, string>();
  for (const line of m[1].split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) meta.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const id = meta.get('id');
  const title = meta.get('title');
  if (!id || !title) return null;
  return {
    id: `science-${id}`,
    kind: 'science',
    title,
    tags: list(meta.get('tags')),
    sources: list(meta.get('sources')),
    text: m[2].trim(),
  };
}
