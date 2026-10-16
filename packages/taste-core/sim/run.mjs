// Bundles the simulation (TypeScript + JSON) with rolldown — it ships with Vite 8 — and runs it on all cores.
//   node sim/run.mjs --users 5000 --out ../../../refectorio-workspace/reports/stage-2/taste-sim
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
// --entry diagnose bundles sim/diagnose.ts instead of the full simulation.
const entryIndex = process.argv.indexOf('--entry');
const entry = entryIndex >= 0 ? process.argv[entryIndex + 1] : 'main';
const args = process.argv
  .slice(2)
  .filter((_, i, all) => all[i] !== '--entry' && all[i - 1] !== '--entry');
const bundle = path.join(here, '..', '.cache', 'sim', `${entry}.mjs`);

await build({
  input: path.join(here, `${entry}.ts`),
  platform: 'node',
  logLevel: 'warn',
  output: { file: bundle, format: 'esm' },
});

const run = spawnSync(process.execPath, [bundle, ...args], { stdio: 'inherit' });
process.exit(run.status ?? 1);
