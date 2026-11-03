// Bundles the menu simulation (TypeScript + JSON) with rolldown — it ships with Vite 8 — and runs it on all cores.
//   npm run menu:sim -- --personas 5000 --out <dir>
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.join(here, '..', '.cache', 'sim', 'main.mjs');

await build({
  input: path.join(here, 'main.ts'),
  platform: 'node',
  logLevel: 'warn',
  output: { file: bundle, format: 'esm' },
});

const run = spawnSync(process.execPath, [bundle, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(run.status ?? 1);
