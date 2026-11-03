// Bundles the food data build (TypeScript + JSON) with rolldown — it ships with Vite 8 — and runs it.
//   npm run food-data            (from refectorio-app)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..', '..', '..');
const bundle = path.join(here, '..', '.cache', 'build.mjs');

await build({
  input: path.join(here, 'build.ts'),
  platform: 'node',
  logLevel: 'warn',
  output: { file: bundle, format: 'esm' },
});

const run = spawnSync(process.execPath, [bundle, appRoot, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
