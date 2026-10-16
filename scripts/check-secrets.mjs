// Pre-commit secret check (lint-staged): fails if a staged file contains the actual photo API keys or an obvious key
// pattern. Keys are read from the environment or ../.secrets/ only to compare — they are never printed.
//   node scripts/check-secrets.mjs <files…>
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readKey } from './photos/lib.mjs';

/** Assignments or headers that look like real credentials (placeholders such as <key> or ${…} do not match). */
export const SECRET_PATTERNS = [
  /Client-ID\s+[A-Za-z0-9_-]{30,}/,
  /Authorization["']?\s*[:=]\s*["'`]?(?:Bearer\s+)?[A-Za-z0-9_-]{40,}/i,
  /\b(?:api[_-]?key|access[_-]?key|secret[_-]?key|token)\b["']?\s*[:=]\s*["'`][A-Za-z0-9_-]{24,}["'`]/i,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bfigd_[A-Za-z0-9_-]{30,}\b/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

export function findSecrets(text, keys) {
  const found = [];
  for (const key of keys) if (key && key.length >= 16 && text.includes(key)) found.push('ключ API');
  for (const pattern of SECRET_PATTERNS) if (pattern.test(text)) found.push('похоже на секрет');
  return found;
}

async function main() {
  const files = process.argv.slice(2).filter((file) => existsSync(file));
  const keys = [await readKey('pexels'), await readKey('unsplash')].filter(Boolean);
  const problems = [];
  for (const file of files) {
    if (/\.(png|jpe?g|webp|avif|woff2?|ico)$/i.test(file)) continue;
    const text = await readFile(file, 'utf8');
    const found = findSecrets(text, keys);
    if (found.length > 0)
      problems.push(`${path.relative(process.cwd(), file)}: ${[...new Set(found)].join(', ')}`);
  }
  if (problems.length > 0) {
    console.error('Коммит остановлен — в файлах найдено похожее на секрет:');
    for (const line of problems) console.error(`  ${line}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
