// Runs a TypeScript entry that imports workspace packages: bundles it with rolldown (it ships with Vite 8) into
// .cache/run-ts/ and runs the bundle with the remaining arguments. The same pattern as `npm run menu:sim`.
//   node scripts/lib/run-ts.mjs <entry.ts> [args…]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [entry, ...args] = process.argv.slice(2);
if (!entry) {
  console.error('usage: node scripts/lib/run-ts.mjs <entry.ts> [args…]');
  process.exit(2);
}
const name = path.basename(entry).replace(/\.ts$/, '');
const bundle = path.join(root, '.cache', 'run-ts', `${name}.mjs`);
await build({
  input: path.resolve(entry),
  platform: 'node',
  logLevel: 'warn',
  output: { file: bundle, format: 'esm' },
});
const run = spawnSync(process.execPath, [bundle, ...args], { stdio: 'inherit' });
process.exit(run.status ?? 1);
