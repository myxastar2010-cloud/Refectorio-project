/**
 * Kiki's HTTP server (ТЗ 07 §2; ADR 0013): `GET /health` and `POST /kiki/chat` (SSE). Stateless, no cookies, CORS by an
 * allowlist, body ≤ 256 KB, per-IP limits, metrics-only logs. The app is a factory so tests drive it with
 * `app.request()` and a fake model.
 */
import {
  chatRequestSchema,
  encodeEvent,
  MAX_BODY_BYTES,
  pairingProblem,
  runTurn,
  type Kb,
  type ServerEvent,
} from '@refectorio/kiki-core';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { ChainUnavailable, type Chain } from './chain';
import type { Limiter } from './rateLimit';

export type AppDeps = {
  readonly chain: Chain;
  readonly kb: Kb;
  readonly kbVersion: string;
  readonly limiter: Limiter;
  readonly allowedOrigins: readonly string[];
  readonly version: string;
  readonly now?: () => number;
  readonly log?: (entry: Record<string, unknown>) => void;
  /** Keep-alive comment interval while the model thinks (proxies close idle streams). */
  readonly pingMs?: number;
};

export const DEFAULT_ORIGINS = [
  'https://refectorio.onrender.com',
  'https://myxastar2010-cloud.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:4180',
];

/** The client's address: the CDN's header first, then the first X-Forwarded-For hop, then «local». */
export function clientIp(c: Context): string {
  const h = (name: string) => c.req.header(name)?.trim();
  return (
    h('true-client-ip') ??
    h('cf-connecting-ip') ??
    h('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}

export function createApp(deps: AppDeps): Hono {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const allowed = new Set(deps.allowedOrigins);
  const app = new Hono();

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
  });
  app.use(
    '*',
    cors({
      origin: (origin) => (allowed.has(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type'],
      maxAge: 600,
    }),
  );

  app.get('/health', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({
      ok: true,
      version: deps.version,
      kb: deps.kbVersion,
      models: deps.chain.models.map((m) => m.id),
      provider: deps.chain.status(),
    });
  });

  app.post(
    '/kiki/chat',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ code: 'bad_request', detail: 'too large' }, 413),
    }),
    async (c) => {
      const origin = c.req.header('origin');
      if (origin && !allowed.has(origin))
        return c.json({ code: 'bad_request', detail: 'origin' }, 403);
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ code: 'bad_request', detail: 'json' }, 400);
      }
      const parsed = chatRequestSchema.safeParse(body);
      if (!parsed.success) return c.json({ code: 'bad_request', detail: 'schema' }, 400);
      const request = parsed.data;
      const problem = pairingProblem(request.messages);
      if (problem) return c.json({ code: 'bad_request', detail: 'pairing' }, 400);

      // A new user turn costs one unit; the steps that bring tool results back are part of the same turn.
      const last = request.messages[request.messages.length - 1];
      if (last?.role === 'user') {
        const wait = deps.limiter.take('chat', clientIp(c));
        if (wait > 0) {
          c.header('Retry-After', String(Math.ceil(wait / 1000)));
          return c.json({ code: 'rate_limited', retryable: true, retryAfterMs: wait }, 429);
        }
      }

      return streamSSE(c, async (stream) => {
        const controller = new AbortController();
        stream.onAbort(() => {
          controller.abort();
        });
        let writes: Promise<unknown> = Promise.resolve();
        const send = (event: ServerEvent) => {
          writes = writes.then(() => stream.write(encodeEvent(event))).catch(() => {});
        };
        const ping = setInterval(() => {
          writes = writes.then(() => stream.write(': ping\n\n')).catch(() => {});
        }, deps.pingMs ?? 10_000);
        const started = now();
        let outcome = 'final';
        let model = '';
        try {
          await runTurn(
            request,
            {
              complete: (r) => deps.chain.complete(r, controller.signal),
              kb: deps.kb,
              now,
            },
            (event) => {
              if (event.type === 'final') model = event.model;
              if (event.type === 'tool-call') outcome = 'tool-call';
              send(event);
            },
          );
        } catch (error) {
          outcome = 'error';
          if (error instanceof ChainUnavailable)
            send({
              type: 'error',
              code: 'provider_unavailable',
              retryable: true,
              retryAfterMs: error.retryAfterMs,
            });
          else if (!controller.signal.aborted)
            send({ type: 'error', code: 'internal', retryable: true });
        } finally {
          clearInterval(ping);
          await writes;
          log({
            event: 'turn',
            ms: now() - started,
            outcome,
            model,
            messages: request.messages.length,
          });
        }
      });
    },
  );

  app.notFound((c) => c.json({ code: 'not_found' }, 404));
  app.onError((_, c) => c.json({ code: 'internal' }, 500));
  return app;
}
