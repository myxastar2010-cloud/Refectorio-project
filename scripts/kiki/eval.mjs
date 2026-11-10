// Runs Kiki's eval suite / bake-off (apps/api/evals/run.ts) with the NVIDIA key read by readKey (never printed).
//   npm run kiki:eval -- --models mistral-low,nemotron --tag bakeoff --runs 3 --judge nemotron
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKey } from '../secrets/read-key.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const key = await readKey('nvidia');
if (!key) {
  console.error('Нет ключа NVIDIA (.secrets/nvidia-api-key.txt или NVIDIA_NIM_API_KEY)');
  process.exit(1);
}
const run = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/lib/run-ts.mjs'), 'apps/api/evals/run.ts', ...process.argv.slice(2)],
  { stdio: 'inherit', cwd: root, env: { ...process.env, NVIDIA_NIM_API_KEY: key } },
);
process.exit(run.status ?? 1);
