import { createEventParser, createKb, type ServerEvent } from '@refectorio/kiki-core';
import { describe, expect, it } from 'vitest';
import { clientTokens, createApp, type AppDeps } from './app';
import { ChainUnavailable, createChain, type Chain } from './chain';
import { mintPass } from './pass';
import {
  parseProviders,
  recoverToolCalls,
  streamChat,
  ProviderError,
  type ModelSpec,
} from './provider';
import { createLimiter, scaleLimits, withShares, LIMITS, type Limits } from './rateLimit';

const kb = createKb({ version: 't', docs: [] });
const usage = { promptTokens: 1, completionTokens: 1, cachedTokens: 0 };

const fakeChain = (complete: Chain['complete']): Chain => ({
  complete,
  status: () => ({ lastOkAt: null, lastErrorAt: null, lastErrorCode: null }),
  models: [{ provider: 'nvidia', id: 'm1', extra: {} }],
});

const ORIGIN = 'http://localhost:5173';
const body = (content = 'Привет') => ({
  v: 1,
  turnId: 'turn1',
  messages: [{ role: 'user', content }],
  memory: { summary: '', facts: [] },
  digest: '',
});

function app(chain: Chain, limit = 20, limits: Limits = {}, extra: Partial<AppDeps> = {}) {
  return createApp({
    chain,
    kb,
    kbVersion: 't',
    limiter: createLimiter(() => 0, { chat: [{ limit, ms: 60_000 }], ...limits }),
    allowedOrigins: [ORIGIN],
    version: 'test',
    ...extra,
  });
}

const post = (
  a: ReturnType<typeof createApp>,
  payload: unknown,
  origin = ORIGIN,
  headers: Record<string, string> = {},
) =>
  a.request('/kiki/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      'x-forwarded-for': '1.2.3.4',
      ...headers,
    },
    body: JSON.stringify(payload),
  });

async function events(res: Response): Promise<ServerEvent[]> {
  const parse = createEventParser();
  return parse(await res.text());
}

describe('app', () => {
  const ok = fakeChain((r) => {
    r.onText?.('Здравствуйте!');
    return Promise.resolve({ content: 'Здравствуйте!', toolCalls: [], model: 'm1', usage });
  });
  /** Asks the call gate before answering, as the real chain does before every provider attempt. */
  const gated = fakeChain((r, _signal, gate) => {
    const wait = gate?.() ?? 0;
    if (wait > 0) return Promise.reject(new ChainUnavailable(wait, false, true));
    r.onText?.('Здравствуйте!');
    return Promise.resolve({ content: 'Здравствуйте!', toolCalls: [], model: 'm1', usage });
  });

  it('health reports version, knowledge and models', async () => {
    const res = await app(ok).request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, version: 'test', kb: 't', models: 1 });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('streams a turn as SSE', async () => {
    const res = await post(app(ok), body());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const out = await events(res);
    expect(out.map((e) => e.type)).toEqual(['status', 'text-delta', 'final']);
  });

  it('refuses bad requests, foreign origins and broken windows', async () => {
    const a = app(ok);
    expect((await post(a, { v: 1 })).status).toBe(400);
    expect((await post(a, body(), 'https://evil.example')).status).toBe(403);
    expect(
      (
        await a.request('/kiki/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body()),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await a.request('/kiki/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: '{nope',
        })
      ).status,
    ).toBe(400);
    const orphan = {
      ...body(),
      messages: [{ role: 'tool', callId: 'x', name: 'get_menu', content: '{}' }],
    };
    expect((await post(a, orphan)).status).toBe(400);
    expect((await a.request('/nope')).status).toBe(404);
  });

  it('every step counts per address; model calls server-wide (M4, D-128)', async () => {
    const step = {
      ...body(),
      messages: [
        { role: 'user', content: 'Где рыба?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: 'find_in_menu', args: '{}' }],
        },
        { role: 'tool', callId: 'c1', name: 'find_in_menu', content: '{}' },
      ],
    };
    const perIp = app(ok, 20, { step: [{ limit: 2, ms: 60_000 }] });
    expect((await post(perIp, step)).status).toBe(200);
    expect((await post(perIp, step)).status).toBe(200);
    expect((await post(perIp, step)).status).toBe(429);
    // One call spends the whole public share: another address is refused before the stream starts.
    const wide = app(gated, 20, { public: [{ limit: 1, ms: 60_000 }] });
    expect((await post(wide, body())).status).toBe(200);
    const other = await wide.request('/kiki/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        'cf-connecting-ip': '5.6.7.8',
      },
      body: JSON.stringify(body()),
    });
    expect(other.status).toBe(429);
  });

  it('limits new turns per IP, not tool-result steps', async () => {
    const a = app(ok, 1);
    expect((await post(a, body())).status).toBe(200);
    const limited = await post(a, body());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: 'rate_limited', retryable: true });
    const step = {
      ...body(),
      messages: [
        { role: 'user', content: 'Где рыба?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: 'find_in_menu', args: '{}' }],
        },
        { role: 'tool', callId: 'c1', name: 'find_in_menu', content: '{}' },
      ],
    };
    expect((await post(a, step)).status).toBe(200);
  });

  it('turns provider failures into a retryable error event', async () => {
    const down = fakeChain(() => Promise.reject(new ChainUnavailable(30_000, false)));
    const out = await events(await post(app(down), body()));
    expect(out.at(-1)).toMatchObject({
      type: 'error',
      code: 'provider_unavailable',
      retryable: true,
      retryAfterMs: 30_000,
    });
    const broken = fakeChain(() => Promise.reject(new Error('boom')));
    expect((await events(await post(app(broken), body()))).at(-1)).toMatchObject({
      type: 'error',
      code: 'internal',
    });
    // Our own call budget, not the provider: the chat says «limit», not «Kiki is down».
    const budget = fakeChain(() => Promise.reject(new ChainUnavailable(5_000, false, true)));
    expect((await events(await post(app(budget), body()))).at(-1)).toMatchObject({
      type: 'error',
      code: 'rate_limited',
      retryAfterMs: 5_000,
    });
  });
});

describe('call budget, demo passes and the switch (security audit P0, D-128)', () => {
  const secret = 'test-secret-'.repeat(4);
  const pass = mintPass(secret, 'jury-1');
  const gated = fakeChain((r, _signal, gate) => {
    const wait = gate?.() ?? 0;
    if (wait > 0) return Promise.reject(new ChainUnavailable(wait, false, true));
    r.onText?.('Да.');
    return Promise.resolve({ content: 'Да.', toolCalls: [], model: 'm1', usage });
  });
  const withPass = (p = pass) => ({ 'x-kiki-pass': p });
  const from = (ip: string) => ({ 'x-forwarded-for': ip });

  it('counts model calls per address, and every address shares the public share', async () => {
    const a = app(gated, 20, { call: [{ limit: 1, ms: 60_000 }] });
    expect((await post(a, body())).status).toBe(200);
    const again = await post(a, body());
    expect(again.status).toBe(429);
    expect(again.headers.get('retry-after')).toBe('60');
    expect((await post(a, body(), ORIGIN, from('9.9.9.9'))).status).toBe(200);
  });

  it('a call refused mid-turn ends the stream with rate_limited', async () => {
    // The pre-check passes (one call left), the turn needs two: the second is refused by the gate.
    const twice = fakeChain((r, _signal, gate) => {
      for (let i = 0; i < 2; i++) {
        const wait = gate?.() ?? 0;
        if (wait > 0) return Promise.reject(new ChainUnavailable(wait, false, true));
      }
      r.onText?.('Да.');
      return Promise.resolve({ content: 'Да.', toolCalls: [], model: 'm1', usage });
    });
    const out = await events(
      await post(app(twice, 20, { public: [{ limit: 1, ms: 60_000 }] }), body()),
    );
    expect(out.at(-1)).toMatchObject({ type: 'error', code: 'rate_limited' });
  });

  it('a demo pass spends the reserve, then the public share, and skips address limits', async () => {
    const a = app(
      gated,
      1,
      {
        public: [{ limit: 1, ms: 60_000 }],
        reserve: [{ limit: 2, ms: 60_000 }],
        call: [{ limit: 1, ms: 60_000 }],
      },
      { demoSecret: secret },
    );
    expect((await post(a, body())).status).toBe(200);
    expect((await post(a, body(), ORIGIN, from('5.5.5.5'))).status).toBe(429);
    // Same address as the first visitor, whose own chat and call limits are spent: the pass still answers twice.
    for (let i = 0; i < 2; i++) {
      const res = await post(a, body(), ORIGIN, withPass());
      expect(res.status).toBe(200);
      expect((await events(res)).at(-1)).toMatchObject({ type: 'final' });
    }
    expect((await post(a, body(), ORIGIN, withPass())).status).toBe(429);
  });

  it('a forged pass or one signed with another secret is just a visitor', async () => {
    const a = app(gated, 20, { public: [{ limit: 0, ms: 60_000 }] }, { demoSecret: secret });
    expect((await post(a, body(), ORIGIN, withPass(`jury-1.${'A'.repeat(43)}`))).status).toBe(429);
    expect(
      (await post(a, body(), ORIGIN, withPass(mintPass('other-'.repeat(8), 'jury-1')))).status,
    ).toBe(429);
    // No secret on the server: passes are off.
    const off = app(gated, 20, { public: [{ limit: 0, ms: 60_000 }] });
    expect((await post(off, body(), ORIGIN, withPass())).status).toBe(429);
  });

  it('KIKI_PUBLIC=0 closes Kiki to everyone without a pass', async () => {
    const a = app(gated, 20, {}, { demoSecret: secret, publicOpen: false });
    const closed = await post(a, body());
    expect(closed.status).toBe(429);
    expect(await closed.json()).toMatchObject({ code: 'rate_limited', retryable: true });
    expect((await post(a, body(), ORIGIN, withPass())).status).toBe(200);
  });

  it('the pass header is allowed by CORS', async () => {
    const res = await app(gated).request('/kiki/chat', {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-kiki-pass',
      },
    });
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-kiki-pass');
  });

  it('refuses requests larger than the client-token cap', async () => {
    const res = await post(
      app(gated, 20, {}, { maxClientTokens: 5 }),
      body('Расскажи подробно про обед'),
    );
    expect(res.status).toBe(413);
    expect(clientTokens(body() as Parameters<typeof clientTokens>[0])).toBeGreaterThan(0);
  });
});

describe('rate limiter', () => {
  it('counts per window and IP, and forgets after the window', () => {
    let t = 0;
    const l = createLimiter(() => t, { chat: [{ limit: 2, ms: 1000 }], vision: [], search: [] });
    expect(l.take(['chat', 'a'])).toBe(0);
    expect(l.take(['chat', 'a'])).toBe(0);
    expect(l.take(['chat', 'a'])).toBe(1000);
    expect(l.take(['chat', 'b'])).toBe(0);
    t = 1000;
    expect(l.take(['chat', 'a'])).toBe(0);
    t = 100_000_000;
    l.sweep();
    expect(l.size()).toBe(0);
    expect(l.take(['chat', 'a'])).toBe(0);
  });

  it('counts all buckets of a use or none of them', () => {
    const l = createLimiter(() => 0, {
      chat: [{ limit: 5, ms: 1000 }],
      step: [{ limit: 1, ms: 1000 }],
    });
    expect(l.take(['step', 'a'], ['chat', 'a'])).toBe(0);
    expect(l.take(['step', 'a'], ['chat', 'a'])).toBe(1000);
    // The refused use cost no chat unit: 4 more fit.
    for (let i = 0; i < 4; i++) expect(l.take(['chat', 'a'])).toBe(0);
    expect(l.take(['chat', 'a'])).toBe(1000);
  });

  it('keeps at most the given number of counters', () => {
    const l = createLimiter(() => 0, { step: [{ limit: 9, ms: 1000 }] }, 100);
    for (let i = 0; i < 500; i++) l.take(['step', `10.0.${String(i)}`]);
    expect(l.size()).toBeLessThanOrEqual(100);
  });

  it('a demo scale multiplies per-address limits, never the server-wide shares', () => {
    const scaled = scaleLimits(LIMITS, 3);
    expect(scaled.chat?.[0]?.limit).toBe(60);
    expect(scaled.call?.[0]?.limit).toBe(90);
    expect(scaled.public).toEqual(LIMITS.public);
    expect(scaled.reserve).toEqual(LIMITS.reserve);
    expect(scaleLimits(LIMITS, Number('x'))).toBe(LIMITS);
  });

  it('the shares per minute stay below the provider allowance (APInex free: 15 / min)', () => {
    const perMin = (b: 'public' | 'reserve') => LIMITS[b].find((w) => w.ms === 60_000)?.limit ?? 0;
    expect(perMin('public') + perMin('reserve')).toBeLessThan(15);
  });

  it('shares from the environment: a valid number replaces the minute window, 0 closes it', () => {
    const s = withShares(LIMITS, { publicPerMin: 0, reservePerMin: 6 });
    expect(s.public?.[0]).toEqual({ limit: 0, ms: 60_000 });
    expect(s.public?.[1]).toEqual(LIMITS.public[1]);
    expect(s.reserve?.[0]?.limit).toBe(6);
    expect(withShares(LIMITS, { publicPerMin: Number('x'), reservePerMin: -1 })).toEqual(LIMITS);
    expect(withShares(LIMITS, {})).toEqual(LIMITS);
  });

  it('check counts nothing; a closed share waits a whole window', () => {
    const l = createLimiter(() => 0, {
      public: [{ limit: 1, ms: 60_000 }],
      reserve: [{ limit: 0, ms: 60_000 }],
    });
    expect(l.check(['public', '*'])).toBe(0);
    expect(l.check(['public', '*'])).toBe(0);
    expect(l.take(['public', '*'])).toBe(0);
    expect(l.check(['public', '*'])).toBe(60_000);
    expect(l.check(['reserve', '*'])).toBe(60_000);
    expect(l.take(['reserve', '*'])).toBe(60_000);
  });
});

// ---------- provider ----------
const sse = (chunks: unknown[]) =>
  chunks.map((c) => `data: ${typeof c === 'string' ? c : JSON.stringify(c)}\n\n`).join('');

function fakeFetch(text: string, status = 200, split = 9): typeof fetch {
  return () => {
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split));
        controller.close();
      },
    });
    return Promise.resolve(new Response(status === 200 ? stream : 'err', { status }));
  };
}

const model: ModelSpec = { provider: 'nvidia', id: 'm1', extra: {} };
const base = { model, key: 'k', firstByteTimeoutMs: 1000, stallTimeoutMs: 1000 };

describe('provider', () => {
  it('parses AI_PROVIDERS', () => {
    expect(
      parseProviders(
        'nvidia:mistralai/x?reasoning_effort=low&ctk.thinking=false&temperature=0.2, nvidia:b/c',
      ),
    ).toEqual([
      {
        provider: 'nvidia',
        id: 'mistralai/x',
        extra: {
          reasoning_effort: 'low',
          temperature: 0.2,
          chat_template_kwargs: { thinking: false },
        },
      },
      { provider: 'nvidia', id: 'b/c', extra: {} },
    ]);
    expect(() => parseProviders('openai:gpt')).toThrow();
  });

  it('streams text, joins tool-call deltas by index and reads usage', async () => {
    const text: string[] = [];
    const body = sse([
      { choices: [{ delta: { reasoning_content: 'думаю' } }] },
      { choices: [{ delta: { content: 'Смотрю ' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'c1',
                  function: { name: 'find_in_menu', arguments: '{"query": "' },
                },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'блины"}' } }] } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 1, id: 'c2', function: { name: 'get_targets', arguments: '{}' } },
              ],
            },
          },
        ],
      },
      {
        model: 'served',
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          prompt_tokens_details: { cached_tokens: 64 },
        },
      },
      'not json',
      '[DONE]',
    ]);
    const out = await streamChat({
      ...base,
      fetchImpl: fakeFetch(body),
      request: { messages: [], maxTokens: 10, onText: (t) => text.push(t) },
    });
    expect(text.join('')).toBe('Смотрю ');
    expect(out.toolCalls).toEqual([
      { id: 'c1', name: 'find_in_menu', args: '{"query": "блины"}' },
      { id: 'c2', name: 'get_targets', args: '{}' },
    ]);
    expect(out.usage).toEqual({ promptTokens: 100, completionTokens: 20, cachedTokens: 64 });
    expect(out.model).toBe('served');
  });

  it('a call written as text that cannot be read is never an answer (minor 10)', async () => {
    const text: string[] = [];
    await expect(
      streamChat({
        ...base,
        fetchImpl: fakeFetch(
          sse([{ choices: [{ delta: { content: '[TOOL_CALLS][{"name": get_menu, oops' } }] }]),
        ),
        request: { messages: [], maxTokens: 10, onText: (t) => text.push(t) },
      }),
    ).rejects.toMatchObject({ code: 'empty' });
    expect(text).toEqual([]);
  });

  it('recovers calls written as text and never shows them', async () => {
    const text: string[] = [];
    const out = await streamChat({
      ...base,
      fetchImpl: fakeFetch(
        sse([
          {
            choices: [
              {
                delta: {
                  content:
                    '[TOOL_CALLS][{"name":"get_menu","arguments":{"from":"2026-11-10","to":"2026-11-11"}}]',
                },
              },
            ],
          },
        ]),
      ),
      request: { messages: [], maxTokens: 10, onText: (t) => text.push(t) },
    });
    expect(text).toEqual([]);
    expect(out.toolCalls[0]).toMatchObject({
      name: 'get_menu',
      args: '{"from":"2026-11-10","to":"2026-11-11"}',
    });
    expect(out.content).toBe('');
    expect(
      recoverToolCalls('<tool_call>{"name":"get_targets","arguments":{}}</tool_call>')?.[0]?.name,
    ).toBe('get_targets');
    expect(recoverToolCalls('просто текст')).toBeNull();
    expect(recoverToolCalls('{"name":"BAD NAME"}')).toBeNull();
  });

  it('a short answer still reaches the screen', async () => {
    const text: string[] = [];
    await streamChat({
      ...base,
      fetchImpl: fakeFetch(
        sse([
          { choices: [{ delta: { content: '{' } }] },
          { choices: [{ delta: { content: ' 67 }' } }] },
        ]),
      ),
      request: { messages: [], maxTokens: 10, onText: (t) => text.push(t) },
    });
    expect(text.join('')).toBe('{ 67 }');
  });

  it('HTTP errors, empty answers and timeouts become ProviderError', async () => {
    await expect(
      streamChat({
        ...base,
        fetchImpl: fakeFetch('', 429),
        request: { messages: [], maxTokens: 1 },
      }),
    ).rejects.toMatchObject({ code: 'http', status: 429 });
    await expect(
      streamChat({
        ...base,
        fetchImpl: fakeFetch(sse(['[DONE]'])),
        request: { messages: [], maxTokens: 1 },
      }),
    ).rejects.toMatchObject({ code: 'empty' });
    const hang = ((_: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      })) as typeof fetch;
    await expect(
      streamChat({
        ...base,
        firstByteTimeoutMs: 20,
        fetchImpl: hang,
        request: { messages: [], maxTokens: 1 },
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
    const net = (() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch;
    await expect(
      streamChat({ ...base, fetchImpl: net, request: { messages: [], maxTokens: 1 } }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('chain', () => {
  it('falls back to the next model on 429 and rests the first one', async () => {
    const calls: string[] = [];
    const fetchImpl = ((_: unknown, init?: RequestInit) => {
      const id = (
        JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { model: string }
      ).model;
      calls.push(id);
      return fakeFetch(
        id === 'a' ? '' : sse([{ choices: [{ delta: { content: 'ok' } }] }]),
        id === 'a' ? 429 : 200,
      )('', init);
    }) as typeof fetch;
    const logs: unknown[] = [];
    const chain = createChain({
      models: parseProviders('nvidia:a,nvidia:b'),
      key: () => 'k',
      fetchImpl,
      log: (e) => logs.push(e),
    });
    expect((await chain.complete({ messages: [], maxTokens: 5 })).content).toBe('ok');
    expect((await chain.complete({ messages: [], maxTokens: 5 })).content).toBe('ok');
    expect(calls).toEqual(['a', 'b', 'b']);
    expect(chain.status().lastErrorCode).toBe('http:429');
    expect(logs.some((l) => JSON.stringify(l).includes('step-error'))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('ok"');
  });

  it('asks the call gate before every attempt, a fallback model too (D-128)', async () => {
    const calls: string[] = [];
    const fetchImpl = ((_: unknown, init?: RequestInit) => {
      const id = (
        JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { model: string }
      ).model;
      calls.push(id);
      return fakeFetch('', 429)('', init);
    }) as typeof fetch;
    const chain = createChain({
      models: parseProviders('nvidia:a,nvidia:b'),
      key: () => 'k',
      fetchImpl,
    });
    let left = 1;
    const gate = () => (left-- > 0 ? 0 : 7_000);
    await expect(
      chain.complete({ messages: [], maxTokens: 1 }, undefined, gate),
    ).rejects.toMatchObject({
      limited: true,
      retryAfterMs: 7_000,
    });
    // The first model was tried and failed; the fallback was refused by the gate, not called.
    expect(calls).toEqual(['a']);
  });

  it('no key or every model down → ChainUnavailable', async () => {
    await expect(
      createChain({ models: parseProviders('nvidia:a'), key: () => null }).complete({
        messages: [],
        maxTokens: 1,
      }),
    ).rejects.toBeInstanceOf(ChainUnavailable);
    const down = createChain({
      models: parseProviders('nvidia:a'),
      key: () => 'k',
      fetchImpl: fakeFetch('', 500),
    });
    await expect(down.complete({ messages: [], maxTokens: 1 })).rejects.toMatchObject({
      retryAfterMs: 30_000,
    });
  });
});
