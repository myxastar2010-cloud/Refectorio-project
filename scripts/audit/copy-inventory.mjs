// Copy inventory (stage 5, phase 0.4 §7): every user-facing Russian string — the content files, the export texts,
// Kiki's visible strings (kiki-core and the API's fallbacks), the page's meta and OG tags — with where it lives and
// flags a copy reviewer looks at first: claim, stat, number, promise, demo, health.
//   node scripts/audit/copy-inventory.mjs [--out <file.md>]
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { values: args } = parseArgs({
  options: {
    out: {
      type: 'string',
      default: path.join(
        ROOT,
        '..',
        'refectorio-workspace',
        'reports',
        'stage-5',
        'audit',
        'copy-inventory.md',
      ),
    },
  },
});

const CYRILLIC = /[А-Яа-яЁё]/;
const FLAGS = [
  ['stat', /\d\s?%|\d+\s?(млн|тыс|млрд)|исследован|опрос|по данным|источник/i],
  ['number', /\d/],
  [
    'claim',
    /лучш|единствен|точн|гарант|научн|проверен|доказ|эксперт|клинич|без диет|забот|персональн|умн|правильн/i,
  ],
  ['promise', /будет|скоро|сможете|поможет|возьм|каждый день|всегда|24\/7|круглосуточ/i],
  ['demo', /демо|скоро|пока не|в разработке|работаем над/i],
  ['health', /леч|диагноз|болезн|заболеван|здоровь|анализ|врач/i],
];

async function list(dir, filter) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await list(full, filter)));
    else if (filter(full)) out.push(full);
  }
  return out;
}

/** The property path of a literal: obj.key[2].other. */
function keyPath(node) {
  const parts = [];
  for (let n = node; n?.parent; n = n.parent) {
    const p = n.parent;
    if (ts.isPropertyAssignment(p) && p.initializer === n) parts.unshift(p.name.getText());
    else if (ts.isArrayLiteralExpression(p)) parts.unshift(`[${p.elements.indexOf(n)}]`);
    else if (ts.isVariableDeclaration(p)) {
      parts.unshift(p.name.getText());
      break;
    } else if (ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) {
      parts.unshift(`${p.name?.getText() ?? 'fn'}()`);
      break;
    }
  }
  return parts.join('.').replace(/\.\[/g, '[');
}

function stringsOf(file, source) {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const rows = [];
  const visit = (node) => {
    let text = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateExpression(node)) text = node.getText().slice(1, -1);
    else if (ts.isJsxText(node)) text = node.getText().trim();
    if (text && CYRILLIC.test(text)) {
      // Skip import paths, test names and regexes' sources: only what a person reads.
      const parent = node.parent;
      const isTest =
        parent &&
        ts.isCallExpression(parent) &&
        /^(it|test|describe)$/.test(parent.expression.getText());
      if (!isTest) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        rows.push({ line: line + 1, key: keyPath(node), text });
      }
    }
    if (!ts.isTemplateExpression(node)) ts.forEachChild(node, visit);
  };
  visit(sf);
  return rows;
}

const sources = [
  ...(await list(path.join(ROOT, 'apps/web/src/content'), (f) => /\.ru\.ts$/.test(f))),
  ...(await list(
    path.join(ROOT, 'apps/web/src/features/menu/export'),
    (f) => /\.ts$/.test(f) && !/\.test\./.test(f),
  )),
  ...(await list(
    path.join(ROOT, 'packages/kiki-core/src'),
    (f) => /\.ts$/.test(f) && !/\.test\./.test(f),
  )),
  ...(await list(path.join(ROOT, 'apps/api/src'), (f) => /\.ts$/.test(f) && !/\.test\./.test(f))),
];
// Components should carry no text (CLAUDE.md): any Russian left in TSX is itself a finding.
const components = await list(
  path.join(ROOT, 'apps/web/src'),
  (f) => /\.tsx$/.test(f) && !/\.test\./.test(f),
);

const sections = [];
let total = 0;
const counts = Object.fromEntries(FLAGS.map(([f]) => [f, 0]));
const esc = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
for (const file of [...sources, ...components]) {
  const rows = stringsOf(file, await readFile(file, 'utf8'));
  if (!rows.length) continue;
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = rows.map((r) => {
    const flags = FLAGS.filter(([, re]) => re.test(r.text)).map(([f]) => f);
    for (const f of flags) counts[f] += 1;
    const text = r.text.length > 220 ? `${r.text.slice(0, 220)}…` : r.text;
    return `| ${r.line} | ${esc(r.key) || '—'} | ${esc(text)} | ${flags.join(', ')} |`;
  });
  total += rows.length;
  sections.push(
    `### ${rel}${file.endsWith('.tsx') ? ' (текст в компоненте!)' : ''}\n\n| стр. | ключ | текст | флаги |\n|---|---|---|---|\n${lines.join('\n')}\n`,
  );
}

// Meta and OG tags of the page.
const html = await readFile(path.join(ROOT, 'apps/web/index.html'), 'utf8');
const meta = [
  ...html.matchAll(
    /<(title)>([^<]+)<\/title>|<meta\s+[^>]*(?:name|property)="([^"]+)"[^>]*content="([^"]+)"/g,
  ),
].map((m) => (m[1] ? `| title | ${esc(m[2])} |` : `| ${m[3]} | ${esc(m[4])} |`));

await mkdir(path.dirname(args.out), { recursive: true });
await writeFile(
  args.out,
  `# Инвентаризация текстов (фаза 0.4 §7)\n\nСобрано скриптом \`scripts/audit/copy-inventory.mjs\` ${new Date().toISOString().slice(0, 10)}. ` +
    `Строк: ${total}. Флаги: ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}.\n` +
    `Флаги — подсказка для проверки, не вывод: claim — утверждение о продукте, stat — статистика/источник, number — число, ` +
    `promise — обещание, demo — демо/«скоро», health — тема здоровья.\n\n## Meta и OG (index.html)\n\n| тег | текст |\n|---|---|\n${meta.join('\n')}\n\n## Строки\n\n${sections.join('\n')}`,
);
console.log(
  `strings ${total} · files ${sections.length} · ${JSON.stringify(counts)} → ${args.out}`,
);
