// Bundles the API server into one file (dist/server.mjs) with rolldown (it ships with Vite 8): workspace TypeScript,
// the knowledge base JSON and Hono included — Render runs `node apps/api/dist/server.mjs`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';

const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  input: path.join(here, 'src', 'server.ts'),
  platform: 'node',
  logLevel: 'warn',
  output: { file: path.join(here, 'dist', 'server.mjs'), format: 'esm', minify: false },
});
console.log('api: dist/server.mjs');
