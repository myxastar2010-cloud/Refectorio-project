// Bundles the menu simulation (TypeScript + JSON) with rolldown — it ships with Vite 8 — and runs it on all cores.
//   npm run menu:sim -- --personas 5000 --out <dir>
//   npm run menu:sim -- show --seed 7      (one person's menu as text, sim/show.ts)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
const show = process.argv[2] === 'show';
const entry = show ? 'show' : 'main';
const bundle = path.join(here, '..', '.cache', 'sim', `${entry}.mjs`);

await build({
  input: path.join(here, `${entry}.ts`),
  platform: 'node',
  logLevel: 'warn',
  output: { file: bundle, format: 'esm' },
});

const args = process.argv.slice(show ? 3 : 2);
const run = spawnSync(process.execPath, [bundle, ...args], { stdio: 'inherit' });
process.exit(run.status ?? 1);
