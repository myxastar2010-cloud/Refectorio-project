/**
 * Entry of the Render Web Service `refectorio-api` (ТЗ 07 §2, ADR 0013). Configuration only from the environment:
 * PORT, NVIDIA_NIM_API_KEY, AI_PROVIDERS, ALLOWED_ORIGINS, KIKI_LIMIT_SCALE (per-address limits × N; default 1),
 * KIKI_PUBLIC_PER_MIN / KIKI_RESERVE_PER_MIN (model calls per minute for everyone / only for demo passes; their sum
 * below the provider's allowance), KIKI_DEMO_SECRET (demo passes, ≥ 32 characters), KIKI_PUBLIC=0 (only demo passes)
 * and HTTPS_PROXY on a developer's computer behind a VPN (D-128).
 */
import http from 'node:http';
import { serve } from '@hono/node-server';
import { createKb, kbFileSchema } from '@refectorio/kiki-core';
import kbJson from '@refectorio/kiki-core/knowledge/kb.json';
import { createApp, DEFAULT_ORIGINS } from './app';
import { createChain } from './chain';
import { parseProviders } from './provider';
import { isPublicOpen, revokedPasses, sharesPerMin } from './config';
import { MIN_SECRET_CHARS } from './pass';
import { createLimiter, LIMITS, scaleLimits, withShares } from './rateLimit';

// fetch() ignores HTTPS_PROXY unless asked (the team's VPN is the only way out to NVIDIA from Russia; Render has none).
if (process.env.HTTPS_PROXY) http.setGlobalProxyFromEnv();

/** The bake-off's order (ADR 0013, D-116): the fast Nemotron first, Mistral Large 4 as the fallback. */
export const DEFAULT_PROVIDERS =
  'nvidia:nvidia/nemotron-3.5-super-vl-120b-a12b,nvidia:mistralai/mistral-large-4-1t-a52b?reasoning_effort=low';

const log = (entry: Record<string, unknown>) => {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));
};

const kbFile = kbFileSchema.parse(kbJson);
const models = parseProviders(process.env.AI_PROVIDERS ?? DEFAULT_PROVIDERS);
const origins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const share = (name: string) =>
  process.env[name] === undefined || process.env[name] === ''
    ? undefined
    : Number(process.env[name]);
const limits = withShares(scaleLimits(LIMITS, Number(process.env.KIKI_LIMIT_SCALE ?? 1)), {
  publicPerMin: share('KIKI_PUBLIC_PER_MIN'),
  reservePerMin: share('KIKI_RESERVE_PER_MIN'),
});
const limiter = createLimiter(Date.now, limits);
const demoSecret = process.env.KIKI_DEMO_SECRET?.trim() || null;
if (demoSecret && demoSecret.length < MIN_SECRET_CHARS)
  log({ event: 'config', warning: 'KIKI_DEMO_SECRET is too short: demo passes are off' });
const publicOpen = isPublicOpen(process.env.KIKI_PUBLIC);
const revoked = revokedPasses(process.env.KIKI_REVOKED_PASSES);
const shares = sharesPerMin(limits);
// What is in force, at every start (no secrets: counts and switches only).
log({
  event: 'config',
  publicOpen,
  passes: demoSecret !== null && demoSecret.length >= MIN_SECRET_CHARS,
  revokedPasses: revoked.size,
  ...shares,
  ...(shares.belowProvider
    ? {}
    : {
        warning:
          'public + reserve per minute reach the provider allowance: the reserve is not guaranteed',
      }),
});
setInterval(() => {
  limiter.sweep();
}, 600_000).unref();

const app = createApp({
  chain: createChain({
    models,
    key: () => process.env.NVIDIA_NIM_API_KEY?.trim() || null,
    log,
  }),
  kb: createKb(kbFile),
  kbVersion: kbFile.version,
  limiter,
  allowedOrigins: origins.length > 0 ? origins : DEFAULT_ORIGINS,
  version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev',
  log,
  demoSecret,
  publicOpen,
  revokedPasses: revoked,
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  log({ event: 'listening', port: info.port, models: models.map((m) => m.id), kb: kbFile.version });
});
