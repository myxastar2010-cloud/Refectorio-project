import {
  encodeEvent,
  type ChatRequest,
  type ServerEvent,
  type WireMessage,
} from '@refectorio/kiki-core';
import { describe, expect, it } from 'vitest';
import {
  createChatSession,
  OLD_TOOL_CHARS,
  selectWindow,
  type ChatState,
  type SessionDeps,
} from './session';

const sse = (events: ServerEvent[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(events.map(encodeEvent).join(''));
        // Split mid-frame: the parser must join chunks.
        for (let i = 0; i < bytes.length; i += 11) controller.enqueue(bytes.slice(i, i + 11));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

const usage = { promptTokens: 1, completionTokens: 1, cachedTokens: 0 };

function harness(responses: (Response | Error)[], toolResult: unknown = { found: [] }) {
  const bodies: ChatRequest[] = [];
  const saved: ChatState[] = [];
  const spoken: string[] = [];
  let id = 0;
  const deps: SessionDeps = {
    post: (body) => {
      bodies.push(body);
      const next = responses.shift();
      if (!next) return Promise.reject(new Error('no response'));
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    runTool: () =>
      Promise.resolve({
        result: toolResult,
        previews: [],
      }),
    digest: () => Promise.resolve('Сегодня: вт.'),
    persist: (s) => saved.push(s),
    now: () => 0,
    newId: () => `i${id++}`,
    online: () => true,
    announce: (t) => spoken.push(t),
  };
  return { session: createChatSession(deps), bodies, saved, spoken };
}

describe('selectWindow', () => {
  const turn = (n: number, toolChars = 10): WireMessage[] => [
    { role: 'user', content: `вопрос ${n}` },
    { role: 'assistant', content: '', toolCalls: [{ id: `c${n}`, name: 'get_menu', args: '{}' }] },
    { role: 'tool', callId: `c${n}`, name: 'get_menu', content: 'x'.repeat(toolChars) },
    { role: 'assistant', content: `ответ ${n}` },
  ];

  it('keeps whole turns, newest first, and cuts old tool results', () => {
    const wire = [...turn(1, 2000), ...turn(2), { role: 'user' as const, content: 'новый' }];
    const { messages, fold, start } = selectWindow(wire, 0, 10_000);
    expect(start).toBe(0);
    expect(fold).toEqual([]);
    expect(messages[0]).toEqual({ role: 'user', content: 'вопрос 1' });
    const oldTool = messages[2];
    expect(oldTool?.role === 'tool' && oldTool.content.length).toBe(OLD_TOOL_CHARS + 1);
  });

  it('folds what no longer fits and never splits a turn', () => {
    const wire = [
      ...turn(1, 3000),
      ...turn(2, 3000),
      ...turn(3),
      { role: 'user' as const, content: 'новый' },
    ];
    const { messages, fold, start } = selectWindow(wire, 0, 400);
    expect(messages[0]?.role).toBe('user');
    // Old tool results are cut to 500 characters, so turn 2 still fits; turn 1 goes to the memory.
    expect(start).toBe(4);
    expect(fold.length).toBe(4);
    expect(selectWindow(wire, 4, 400).fold).toEqual([]);
  });
});

describe('chat session', () => {
  it('a plain turn: user item, streamed text, the final answer, saved', async () => {
    const h = harness([
      sse([
        { type: 'status', phase: 'thinking' },
        { type: 'text-delta', text: 'Привет! Чем ' },
        { type: 'text-delta', text: 'помочь?' },
        {
          type: 'final',
          text: 'Привет! Чем помочь?',
          replaced: false,
          messages: [{ role: 'assistant', content: 'Привет! Чем помочь?' }],
          model: 'm',
          usage,
        },
      ]),
    ]);
    await h.session.send('Привет');
    const s = h.session.get();
    expect(s.items.map((i) => i.kind)).toEqual(['user', 'kiki']);
    expect(s.wire.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(s.busy).toBeNull();
    expect(h.saved.length).toBeGreaterThan(0);
    expect(h.spoken.join(' ')).toContain('Привет!');
    expect(h.bodies[0]).toMatchObject({
      v: 1,
      digest: 'Сегодня: вт.',
      messages: [{ role: 'user', content: 'Привет' }],
    });
    expect(h.bodies[0]?.turnId).toMatch(/^[a-zA-Z0-9_-]{4,64}$/);
  });

  it('a client tool: continue + tool-call → the result goes back in the next request', async () => {
    const call: WireMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'c1', name: 'find_in_menu', args: '{"query":"блины"}' }],
    };
    const h = harness(
      [
        sse([
          { type: 'continue', messages: [call] },
          { type: 'tool-call', callId: 'c1', name: 'find_in_menu', args: { query: 'блины' } },
        ]),
        sse([
          { type: 'ui', ui: { kind: 'open', target: 'dish', id: 'd_blini' } },
          {
            type: 'final',
            text: 'Блины во вторник.',
            replaced: true,
            messages: [{ role: 'assistant', content: 'Блины во вторник.' }],
            model: 'm',
            usage,
          },
        ]),
      ],
      { found: [{ date: '2026-11-10', name: 'Блины' }] },
    );
    await h.session.send('Где блины?');
    const second = h.bodies[1]?.messages ?? [];
    expect(second.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(second[2]).toMatchObject({ role: 'tool', callId: 'c1', name: 'find_in_menu' });
    const last = h.session.get().items.at(-1);
    expect(last).toMatchObject({
      kind: 'kiki',
      replaced: true,
      buttons: [{ kind: 'open', target: 'dish' }],
    });
  });

  it('a choice: chips on the answer, a pick sends the option', async () => {
    const h = harness([
      sse([
        {
          type: 'ui',
          ui: { kind: 'choice', questionRu: 'Какой ужин?', options: ['Сегодня', 'Завтра'] },
        },
        {
          type: 'final',
          text: 'Какой ужин?',
          replaced: false,
          messages: [{ role: 'assistant', content: 'Какой ужин?' }],
          model: 'm',
          usage,
        },
      ]),
      sse([
        {
          type: 'final',
          text: 'Хорошо.',
          replaced: false,
          messages: [{ role: 'assistant', content: 'Хорошо.' }],
          model: 'm',
          usage,
        },
      ]),
    ]);
    await h.session.send('Замени ужин');
    const asked = h.session.get().items.at(-1);
    expect(asked).toMatchObject({ choice: { options: ['Сегодня', 'Завтра'] } });
    await h.session.pick(asked?.id ?? '', 'Сегодня');
    expect(h.session.get().items.map((i) => (i.kind === 'user' ? i.text : i.kind))).toEqual([
      'Замени ужин',
      'kiki',
      'Сегодня',
      'kiki',
    ]);
  });

  it('errors roll the unfinished turn back and offer a retry', async () => {
    const call: WireMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'c1', name: 'get_menu', args: '{}' }],
    };
    const h = harness([
      sse([
        { type: 'continue', messages: [call] },
        { type: 'tool-call', callId: 'c1', name: 'get_menu', args: {} },
      ]),
      sse([{ type: 'error', code: 'provider_unavailable', retryable: true, retryAfterMs: 30_000 }]),
      sse([
        {
          type: 'final',
          text: 'Готово.',
          replaced: false,
          messages: [{ role: 'assistant', content: 'Готово.' }],
          model: 'm',
          usage,
        },
      ]),
    ]);
    await h.session.send('Меню');
    const s = h.session.get();
    expect(s.wire).toEqual([]);
    const error = s.items.at(-1);
    expect(error).toMatchObject({ kind: 'error', code: 'provider_unavailable', retry: 'Меню' });
    await h.session.retry(error?.id ?? '');
    expect(h.session.get().items.map((i) => i.kind)).toEqual(['user', 'kiki']);
  });

  it('HTTP 429 and network failures become readable errors', async () => {
    const limited = harness([
      new Response(JSON.stringify({ retryAfterMs: 120_000 }), { status: 429 }),
    ]);
    await limited.session.send('Привет');
    expect(limited.session.get().items.at(-1)).toMatchObject({
      code: 'rate_limited',
      retryAfterMs: 120_000,
    });
    const broken = harness([new Error('network')]);
    await broken.session.send('Привет');
    expect(broken.session.get().items.at(-1)).toMatchObject({ code: 'provider_unavailable' });
  });

  it('memory events move the fold mark; clear empties everything', async () => {
    const h = harness([
      sse([
        { type: 'memory', memory: { summary: 'S', facts: ['F'] } },
        {
          type: 'final',
          text: 'Ок.',
          replaced: false,
          messages: [{ role: 'assistant', content: 'Ок.' }],
          model: 'm',
          usage,
        },
      ]),
    ]);
    await h.session.send('Привет');
    expect(h.session.get().memory).toEqual({ summary: 'S', facts: ['F'] });
    h.session.clear();
    expect(h.session.get().items).toEqual([]);
    expect(h.session.get().memory.facts).toEqual([]);
  });
});
