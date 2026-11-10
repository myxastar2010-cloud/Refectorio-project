// Local Kiki server for development (ТЗ 07 §2): builds apps/api and runs it on port 8787 with the NVIDIA key from
// .secrets/ (through readKey — never printed). The site's dev server proxies /api to it.
//   npm run dev:api
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKey } from '../secrets/read-key.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const built = spawnSync(process.execPath, [path.join(root, 'apps/api/build.mjs')], {
  stdio: 'inherit',
});
if (built.status !== 0) process.exit(built.status ?? 1);
const key = await readKey('nvidia');
if (!key) console.warn('Нет ключа NVIDIA: Кики будет отвечать ошибкой «недоступна».');
const child = spawn(process.execPath, [path.join(root, 'apps/api/dist/server.mjs')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT ?? '8787',
    ...(key ? { NVIDIA_NIM_API_KEY: key } : {}),
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
