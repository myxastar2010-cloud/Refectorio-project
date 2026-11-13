// Demo passes for the jury's and the presenter's devices (stage 5, phase 0; D-128). The same formula as
// apps/api/src/pass.ts (a test keeps them in step). Nothing secret is printed: the links go to a file in the workspace.
//   node scripts/kiki/demo-pass.mjs --generate            → creates .secrets/kiki-demo-secret.txt (if missing)
//   node scripts/kiki/demo-pass.mjs presenter jury-1 jury-2 → refectorio-workspace/pitch/demo-passes.md
// The same secret goes to Render → refectorio-api → Environment → KIKI_DEMO_SECRET. A new secret revokes every pass.
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKey } from '../secrets/read-key.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://refectorio.onrender.com/';
const NAME = /^[a-z0-9-]{1,32}$/;

export const mintPass = (secret, name) =>
  `${name}.${createHmac('sha256', secret).update(`kiki-pass:v1:${name}`).digest('base64url')}`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--generate')) {
    const file = path.join(ROOT, '..', '.secrets', 'kiki-demo-secret.txt');
    if (existsSync(file)) {
      console.log('The secret already exists — nothing changed.');
      return;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${randomBytes(36).toString('base64url')}\n`, { flag: 'wx' });
    console.log(
      'Created .secrets/kiki-demo-secret.txt — copy its contents to Render → refectorio-api → KIKI_DEMO_SECRET.',
    );
    return;
  }
  const names = args.filter((a) => !a.startsWith('--'));
  if (names.length === 0 || names.some((n) => !NAME.test(n))) {
    console.error(
      'usage: node scripts/kiki/demo-pass.mjs <name…> (a–z, 0–9, -; ≤ 32)  |  --generate',
    );
    process.exitCode = 2;
    return;
  }
  const secret = await readKey('kikiDemo');
  if (!secret || secret.length < 32) {
    console.error('No KIKI_DEMO_SECRET (≥ 32 characters): run with --generate first.');
    process.exitCode = 1;
    return;
  }
  const out = path.join(ROOT, '..', 'refectorio-workspace', 'pitch', 'demo-passes.md');
  await mkdir(path.dirname(out), { recursive: true });
  const rows = names.map((n) => `| ${n} | ${SITE}#kiki-pass=${mintPass(secret, n)} |`);
  await writeFile(
    out,
    `# Демо-пропуска Кики\n\nОткройте ссылку один раз на нужном устройстве — Кики будет отвечать ему из резерва даже\nпри исчерпанном общем лимите или при KIKI_PUBLIC=0. Не публикуйте ссылки: новый секрет на Render отменяет все.\n\n| Устройство | Ссылка |\n|---|---|\n${rows.join('\n')}\n`,
  );
  console.log(`${String(names.length)} pass link(s) → ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  await main();
