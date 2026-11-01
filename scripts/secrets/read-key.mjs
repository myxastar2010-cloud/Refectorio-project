// The one place that reads API keys: the environment variable first (Render, CI), then the project's .secrets/ folder
// outside the repository. A key is never printed, logged or written anywhere.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// fetch() ignores HTTPS_PROXY unless told otherwise, and the VPN's local proxy is the only way out to NVIDIA from the
// team's computers: a direct request gets 451 (region block). On Render there is no proxy and this does nothing.
if (process.env.HTTPS_PROXY) http.setGlobalProxyFromEnv?.();

export const KEYS = {
  nvidia: { env: 'NVIDIA_NIM_API_KEY', file: 'nvidia-api-key.txt' },
  tavily: { env: 'TAVILY_API_KEY', file: 'tavily-api-key.txt' },
  pexels: { env: 'PEXELS_API_KEY', file: 'pexels-api-key.txt' },
  unsplash: { env: 'UNSPLASH_ACCESS_KEY', file: 'unsplash-access-key.txt' },
};

/** The key or null. Never print the result. */
export async function readKey(name) {
  const spec = KEYS[name];
  if (!spec) throw new Error(`Unknown key name: ${name}`);
  const fromEnv = process.env[spec.env]?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(PROJECT_ROOT, '.secrets', spec.file);
  if (!existsSync(file)) return null;
  const value = (await readFile(file, 'utf8')).trim();
  return value.length > 0 ? value : null;
}
