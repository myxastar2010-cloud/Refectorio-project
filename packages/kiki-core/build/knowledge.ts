// Compiles Kiki's knowledge (ТЗ 07 §9) from Markdown into packages/kiki-core/knowledge/kb.json: the site guide (one doc
// per section) and the science cards. The file changes only when the content does.
//   npm run kiki:kb   (bundled and run by scripts/lib/run-ts.mjs)
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  kbFileSchema,
  parseCard,
  parseGuide,
  stableKbVersion,
  type KbDoc,
} from '@refectorio/kiki-core';

const dir = path.resolve('packages/kiki-core/knowledge');
const docs: KbDoc[] = [...parseGuide(readFileSync(path.join(dir, 'site-guide.ru.md'), 'utf8'))];
const problems: string[] = [];
for (const file of readdirSync(path.join(dir, 'science')).sort()) {
  if (!file.endsWith('.md')) continue;
  const card = parseCard(readFileSync(path.join(dir, 'science', file), 'utf8'));
  if (card) docs.push(card);
  else problems.push(file);
}
const ids = new Set<string>();
for (const d of docs) {
  if (ids.has(d.id)) problems.push(`duplicate id ${d.id}`);
  ids.add(d.id);
}
const file = kbFileSchema.parse({ version: stableKbVersion(docs), docs });
const out = path.join(dir, 'kb.json');
const text = `${JSON.stringify(file, null, 1)}\n`;
const changed = !existsSync(out) || readFileSync(out, 'utf8') !== text;
if (changed) writeFileSync(out, text);
const guide = docs.filter((d) => d.kind === 'guide').length;
console.log(
  `kb: ${guide} guide sections, ${docs.length - guide} science cards, version ${file.version}${changed ? '' : ' (unchanged)'}`,
);
if (problems.length > 0) {
  console.error(`problems: ${problems.join(', ')}`);
  process.exit(1);
}
