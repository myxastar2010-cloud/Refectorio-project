import { createEventParser, createKb, type ServerEvent } from '@refectorio/kiki-core';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { ChainUnavailable, createChain, type Chain } from './chain';
import {
  parseProviders,
  recoverToolCalls,
  streamChat,
  ProviderError,
  type ModelSpec,
} from './provider';
import { createLimiter } from './rateLimit';

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

function app(chain: Chain, limit = 20) {
  return createApp({
    chain,
    kb,
    kbVersion: 't',
    limiter: createLimiter(() => 0, { chat: [{ limit, ms: 60_000 }], vision: [], search: [] }),
    allowedOrigins: [ORIGIN],
    version: 'test',
  });
}

const post = (a: ReturnType<typeof createApp>, payload: unknown, origin = ORIGIN) =>
  a.request('/kiki/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '1.2.3.4' },
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

  it('health reports version, knowledge and models', async () => {
    const res = await app(ok).request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, version: 'test', kb: 't', models: ['m1'] });
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
  });
});

describe('rate limiter', () => {
  it('counts per window and IP, and forgets after the window', () => {
    let t = 0;
    const l = createLimiter(() => t, { chat: [{ limit: 2, ms: 1000 }], vision: [], search: [] });
    expect(l.take('chat', 'a')).toBe(0);
    expect(l.take('chat', 'a')).toBe(0);
    expect(l.take('chat', 'a')).toBe(1000);
    expect(l.take('chat', 'b')).toBe(0);
    t = 1000;
    expect(l.take('chat', 'a')).toBe(0);
    t = 100_000_000;
    l.sweep();
    expect(l.take('chat', 'a')).toBe(0);
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
