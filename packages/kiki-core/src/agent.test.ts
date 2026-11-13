import { describe, expect, it } from 'vitest';
import {
  groundingSources,
  normalizeCalls,
  runTurn,
  toProviderMessages,
  type Complete,
  type ProviderRequest,
  type ProviderResult,
} from './agent';
import { createKb } from './knowledge';
import { toolCallSchema, type WireMessage } from './messages';
import { MAX_TOOL_ROUNDS, type ChatRequest, type ServerEvent } from './protocol';
import { IDENTITY_RU } from './validate';

const kb = createKb({
  version: 't',
  docs: [
    {
      id: 'guide-download',
      kind: 'guide',
      title: 'Скачать меню',
      tags: [],
      sources: [],
      text: 'Нажмите «⋯» над меню, затем «Скачать меню» и выберите формат.',
    },
    {
      id: 'science-salt',
      kind: 'science',
      title: 'Соль',
      tags: ['соль', 'натрий'],
      sources: ['R17 E7'],
      text: 'Не больше 5 г соли в день [R17 E7].',
    },
  ],
});

const usage = { promptTokens: 10, completionTokens: 5, cachedTokens: 0 };
const say = (content: string): ProviderResult => ({ content, toolCalls: [], model: 'm', usage });
const call = (name: string, args: unknown, id = `c-${name}`): ProviderResult => ({
  content: '',
  toolCalls: [{ id, name, args: JSON.stringify(args) }],
  model: 'm',
  usage,
});

function scripted(results: ProviderResult[]): { complete: Complete; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  const complete: Complete = (request) => {
    requests.push(request);
    const next = results.shift();
    if (!next) throw new Error('no more scripted results');
    if (next.content && request.onText) request.onText(next.content);
    return Promise.resolve(next);
  };
  return { complete, requests };
}

const request = (messages: WireMessage[], extra: Partial<ChatRequest> = {}): ChatRequest => ({
  v: 1,
  turnId: 'turn1',
  messages,
  memory: { summary: '', facts: [] },
  digest: 'Цель на день: 1800 ккал.',
  ...extra,
});

async function run(req: ChatRequest, results: ProviderResult[]) {
  const { complete, requests } = scripted(results);
  const events: ServerEvent[] = [];
  await runTurn(req, { complete, kb, now: () => 0 }, (e) => events.push(e));
  return { events, requests };
}

const types = (events: ServerEvent[]) => events.map((e) => e.type);
const final = (events: ServerEvent[]) => {
  const e = events.find((x) => x.type === 'final');
  if (e?.type !== 'final') throw new Error('no final');
  return e;
};

describe('runTurn', () => {
  it('a plain answer streams and ends with final', async () => {
    const { events, requests } = await run(
      request([{ role: 'user', content: 'Сколько будет 3+64?' }]),
      [say('67! Если понадобится помощь с меню — обращайтесь.')],
    );
    expect(types(events)).toEqual(['status', 'text-delta', 'final']);
    expect(final(events).messages).toEqual([
      { role: 'assistant', content: '67! Если понадобится помощь с меню — обращайтесь.' },
    ]);
    // The static prompt first, then the context with the digest.
    const system = requests[0]?.messages[0];
    expect(system?.role).toBe('system');
    expect(system && 'content' in system ? system.content : '').toContain(
      'Цель на день: 1800 ккал.',
    );
    expect(requests[0]?.tools?.length).toBeGreaterThan(5);
  });

  it('a client tool ends the step with continue + tool-call', async () => {
    const { events } = await run(
      request([{ role: 'user', content: 'Сколько калорий в блинах?' }]),
      [call('find_in_menu', { query: 'блины' })],
    );
    expect(types(events)).toEqual(['status', 'continue', 'tool-call']);
    const cont = events[1];
    expect(cont?.type === 'continue' && cont.messages[0]).toMatchObject({
      role: 'assistant',
      toolCalls: [{ name: 'find_in_menu' }],
    });
    expect(events[2]).toMatchObject({
      type: 'tool-call',
      name: 'find_in_menu',
      args: { query: 'блины' },
    });
  });

  it('proposals announce planning', async () => {
    const { events } = await run(request([{ role: 'user', content: 'Без чеснока' }]), [
      call('propose_menu_change', {
        rules: [
          { kind: 'excludeIngredient', target: { category: 'garlic' }, textRu: 'Без чеснока' },
        ],
        reasonRu: 'аллергия',
      }),
    ]);
    expect(events.some((e) => e.type === 'status' && e.phase === 'planning')).toBe(true);
  });

  it('runs the knowledge search on the server and answers', async () => {
    const { events, requests } = await run(
      request([{ role: 'user', content: 'Сколько соли можно?' }]),
      [call('kb_search', { query: 'соль в день' }), say('Не больше 5 г соли в день.')],
    );
    expect(types(events)).toContain('server-tool');
    expect(final(events).text).toBe('Не больше 5 г соли в день.');
    const second = requests[1]?.messages.at(-1);
    expect(second).toMatchObject({ role: 'tool', name: 'kb_search' });
  });

  it('ask_choice alone ends the turn with the question', async () => {
    const { events, requests } = await run(request([{ role: 'user', content: 'Замени ужин' }]), [
      call('ask_choice', { questionRu: 'Какой ужин заменить?', options: ['Сегодня', 'Завтра'] }),
    ]);
    expect(requests.length).toBe(1);
    expect(events.find((e) => e.type === 'ui')).toMatchObject({
      ui: { kind: 'choice', options: ['Сегодня', 'Завтра'] },
    });
    expect(final(events).text).toBe('Какой ужин заменить?');
    expect(final(events).messages.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant']);
  });

  it('open_ui shows a button and the model text stays', async () => {
    const { events } = await run(request([{ role: 'user', content: 'Где рецепты?' }]), [
      { ...call('open_ui', { target: 'recipes' }), content: 'Рецепты — в боковой панели.' },
    ]);
    expect(events.find((e) => e.type === 'ui')).toMatchObject({
      ui: { kind: 'open', target: 'recipes' },
    });
    expect(final(events).text).toBe('Рецепты — в боковой панели.');
  });

  it('chips with an invented number go back to the model; the clean question is shown (M1)', async () => {
    const { events, requests } = await run(request([{ role: 'user', content: 'Ужин поменьше' }]), [
      call('ask_choice', { questionRu: 'Сколько оставить?', options: ['2 450 ккал', 'Как есть'] }),
      call('ask_choice', { questionRu: 'Уменьшить ужин?', options: ['Да', 'Нет'] }, 'c-2'),
    ]);
    expect(requests.length).toBe(2);
    const error = requests[1]?.messages.at(-1);
    expect(error).toMatchObject({ role: 'tool', name: 'ask_choice' });
    expect(JSON.stringify(error)).toContain('not shown');
    expect(final(events).text).toBe('Уменьшить ужин?');
  });

  it('the words beside chips pass the number check; on failure the question replaces them (M1)', async () => {
    const { events } = await run(request([{ role: 'user', content: 'Ужин поменьше' }]), [
      {
        ...call('ask_choice', { questionRu: 'Уменьшить ужин?', options: ['Да', 'Нет'] }),
        content: 'Ваша норма — 2 450 ккал. Уменьшить ужин?',
      },
    ]);
    expect(final(events)).toMatchObject({ text: 'Уменьшить ужин?', replaced: true });
  });

  it('a proposal with an amount the user never said goes back to the model (M3)', async () => {
    const rule = {
      kind: 'minNutrient',
      nutrient: 'proteinG',
      per: 'meal',
      meals: ['dinner'],
      value: 35,
      textRu: 'Ужин — от 35 г белка',
    };
    const asked = await run(request([{ role: 'user', content: 'Хочу больше белка на ужин' }]), [
      call('propose_menu_change', { rules: [rule], reasonRu: 'больше белка' }),
      say('Сколько граммов белка на ужин вы хотите?'),
    ]);
    expect(types(asked.events)).not.toContain('tool-call');
    expect(JSON.stringify(asked.requests[1]?.messages.at(-1))).toContain(
      'amounts not from the user',
    );

    const said = await run(request([{ role: 'user', content: 'Хочу от 35 г белка на ужин' }]), [
      call('propose_menu_change', { rules: [rule], reasonRu: 'больше белка' }),
    ]);
    expect(types(said.events)).toContain('tool-call');
  });

  it('echoed arguments and the model-written summary never ground a number (M3)', () => {
    const sources = groundingSources(
      [
        { role: 'user', content: 'Без творога' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'c1', name: 'resolve_food_terms', args: '{"terms":["350 г творога"]}' },
          ],
        },
        {
          role: 'tool',
          callId: 'c1',
          name: 'resolve_food_terms',
          content: '{"matched":[{"term":"350 г творога","category":"cottage_cheese"}],"kcal":120}',
        },
      ],
      '',
      { memory: { summary: 'Норма 2450 ккал.', facts: ['Не ест творог'] } },
    );
    const all = [...sources.toolResults, ...sources.userTexts].join(' ');
    expect(all).not.toContain('350');
    expect(all).not.toContain('2450');
    expect(all).toContain('120');
  });

  it('bad arguments and unknown tools go back to the model as errors', async () => {
    const { events, requests } = await run(request([{ role: 'user', content: 'Меню' }]), [
      {
        content: '',
        toolCalls: [
          { id: 'a', name: 'get_menu', args: '{not json' },
          { id: 'b', name: 'hack_tool', args: '{}' },
        ],
        model: 'm',
        usage,
      },
      say('Сейчас не получилось открыть меню.'),
    ]);
    const tools = requests[1]?.messages.filter((m) => m.role === 'tool') ?? [];
    expect(tools.map((m) => ('content' in m ? m.content : ''))).toEqual([
      expect.stringContaining('not valid JSON'),
      expect.stringContaining('unknown tool'),
    ]);
    expect(final(events).text).toContain('не получилось');
  });

  it('duplicate calls in one step run once', async () => {
    const twice: ProviderResult = {
      content: '',
      toolCalls: [
        { id: 'x1', name: 'find_in_menu', args: '{"query":"рыба"}' },
        { id: 'x2', name: 'find_in_menu', args: ' {"query":"рыба"}' },
      ],
      model: 'm',
      usage,
    };
    const { events } = await run(request([{ role: 'user', content: 'Где рыба?' }]), [twice]);
    expect(events.filter((e) => e.type === 'tool-call').length).toBe(1);
  });

  it('text written before tool calls is reset', async () => {
    const { events } = await run(request([{ role: 'user', content: 'Где рыба?' }]), [
      { ...call('find_in_menu', { query: 'рыба' }), content: 'Сейчас посмотрю.' },
    ]);
    expect(types(events)).toEqual(['status', 'text-delta', 'text-reset', 'continue', 'tool-call']);
  });

  it('an ungrounded number → one corrective re-ask without tools', async () => {
    const { events, requests } = await run(
      request([{ role: 'user', content: 'Сколько калорий в обеде?' }]),
      [say('В обеде примерно 650 ккал.'), say('Точное число — в подробностях блюда.')],
    );
    expect(final(events)).toMatchObject({
      text: 'Точное число — в подробностях блюда.',
      replaced: true,
    });
    expect(requests[1]?.tools).toBeUndefined();
    const ask = requests[1]?.messages.at(-1);
    expect(ask && 'content' in ask ? ask.content : '').toContain('650 ккал');
  });

  it('numbers from the digest and the user pass; a second failure falls back', async () => {
    const ok = await run(request([{ role: 'user', content: 'Какая у меня цель?' }]), [
      say('Цель — 1 800 ккал в день.'),
    ]);
    expect(final(ok.events).replaced).toBe(false);
    const bad = await run(request([{ role: 'user', content: 'Ты кто?' }]), [
      say('Я модель Mistral.'),
      say('Я на базе DeepSeek.'),
    ]);
    expect(final(bad.events)).toMatchObject({ text: IDENTITY_RU, replaced: true });
  });

  it('after the round limit the model gets no tools', async () => {
    const rounds: WireMessage[] = [{ role: 'user', content: 'Много всего' }];
    for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
      rounds.push({
        role: 'assistant',
        content: '',
        toolCalls: [{ id: `r${i}`, name: 'get_targets', args: '{}' }],
      });
      rounds.push({ role: 'tool', callId: `r${i}`, name: 'get_targets', content: '{"kcal":1800}' });
    }
    const { requests, events } = await run(request(rounds), [say('Готово.')]);
    expect(requests[0]?.tools).toBeUndefined();
    expect(final(events).text).toBe('Готово.');
  });

  it('over the turn budget the model answers without tools', async () => {
    const { complete, requests } = scripted([say('Отвечаю сразу.')]);
    const events: ServerEvent[] = [];
    await runTurn(
      request([{ role: 'user', content: 'Вопрос' }], { turnElapsedMs: 100_000 }),
      { complete, kb, now: () => 5 },
      (e) => events.push(e),
    );
    expect(requests[0]?.tools).toBeUndefined();
  });

  it('the budget is a duration: a computer clock far behind the server never removes the tools (M5)', async () => {
    const { complete, requests } = scripted([say('Ответ.')]);
    await runTurn(
      request([{ role: 'user', content: 'Вопрос' }], { turnElapsedMs: 1200 }),
      { complete, kb, now: () => 1_800_000_000_000 },
      () => {},
    );
    expect(requests[0]?.tools).toBeDefined();
  });

  it('a failed fold keeps the old memory and the answer still comes (M7)', async () => {
    const results = [say('Здравствуйте!')];
    let calls = 0;
    const events: ServerEvent[] = [];
    await runTurn(
      request([{ role: 'user', content: 'Привет' }], {
        memory: { summary: 'старое', facts: ['факт'] },
        fold: [{ role: 'user', content: 'x' }],
      }),
      {
        complete: (r) => {
          calls++;
          if (r.jsonOnly) return Promise.reject(new Error('json mode refused'));
          const next = results.shift();
          return next ? Promise.resolve(next) : Promise.reject(new Error('none'));
        },
        kb,
        now: () => 0,
      },
      (e) => events.push(e),
    );
    expect(calls).toBe(2);
    expect(events.find((e) => e.type === 'memory')).toMatchObject({
      memory: { summary: 'старое', facts: ['факт'] },
    });
    expect(final(events).text).toBe('Здравствуйте!');
  });

  it('malformed calls from a model are made to fit the wire schema (M8)', () => {
    const calls = normalizeCalls(
      [
        { id: 'a', name: 'get_menu', args: '{}' },
        { id: 'a', name: 'get_menu', args: '{}' },
        { id: 'a', name: 'find_in_menu', args: '{"query":"рыба"}' },
        { id: '', name: 'Get-Menu!', args: '{}' },
        { id: 'x'.repeat(200), name: 'kb_search', args: 'y'.repeat(9000) },
      ],
      '1',
    );
    expect(calls.map((c) => c.name)).toEqual([
      'get_menu',
      'find_in_menu',
      'unknown_tool',
      'kb_search',
    ]);
    expect(new Set(calls.map((c) => c.id)).size).toBe(4);
    expect(calls.every((c) => toolCallSchema.safeParse(c).success)).toBe(true);
    expect(calls[3]?.args.length).toBeLessThan(100);
  });

  it('oversized arguments go back to the model as an error (M8)', async () => {
    const { requests } = await run(request([{ role: 'user', content: 'Найди' }]), [
      call('kb_search', { query: 'q'.repeat(9000) }),
      say('Не нашла.'),
    ]);
    expect(JSON.stringify(requests[1]?.messages.at(-1))).toContain('arguments too long');
  });

  it('folds old turns into memory first', async () => {
    const { events, requests } = await run(
      request([{ role: 'user', content: 'Привет' }], {
        fold: [
          { role: 'user', content: 'Я не люблю пшёнку' },
          { role: 'assistant', content: 'Поняла.' },
        ],
      }),
      [say('{"summary":"Обсудили пшёнку.","facts":["не любит пшёнку"]}'), say('Здравствуйте!')],
    );
    expect(events.find((e) => e.type === 'memory')).toMatchObject({
      memory: { facts: ['не любит пшёнку'] },
    });
    expect(requests[0]?.jsonOnly).toBe(true);
    const system = requests[1]?.messages[0];
    expect(system && 'content' in system ? system.content : '').toContain('не любит пшёнку');
  });

  it('a broken summary keeps the old memory', async () => {
    const { events } = await run(
      request([{ role: 'user', content: 'Привет' }], {
        memory: { summary: 'старое', facts: ['факт'] },
        fold: [{ role: 'user', content: 'x' }],
      }),
      [say('not json at all'), say('Здравствуйте!')],
    );
    expect(events.find((e) => e.type === 'memory')).toMatchObject({
      memory: { summary: 'старое', facts: ['факт'] },
    });
  });
});

describe('toProviderMessages', () => {
  it('maps tool calls and results to the OpenAI shape', () => {
    const out = toProviderMessages('S', [
      { role: 'user', content: 'u' },
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'get_menu', args: '{}' }] },
      { role: 'tool', callId: '1', name: 'get_menu', content: '{}' },
      { role: 'assistant', content: 'ok' },
    ]);
    expect(out[2]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: '1', type: 'function', function: { name: 'get_menu', arguments: '{}' } }],
    });
    expect(out[3]).toEqual({ role: 'tool', tool_call_id: '1', name: 'get_menu', content: '{}' });
  });
});

describe('the call budget of one request (security audit P0, D-128)', () => {
  const ask = request([{ role: 'user', content: 'Сколько соли можно?' }]);
  async function capped(req: ChatRequest, results: ProviderResult[], maxCalls: number) {
    const { complete, requests } = scripted(results);
    const events: ServerEvent[] = [];
    await runTurn(req, { complete, kb, now: () => 0, maxCalls }, (e) => events.push(e));
    return { events, requests };
  }

  it('offers tools only while a call for the answer is left', async () => {
    const searches = Array.from({ length: MAX_TOOL_ROUNDS }, (_, i) =>
      call('kb_search', { query: 'соль' }, `s${String(i)}`),
    );
    const { events, requests } = await capped(ask, [...searches.slice(0, 2), say('Ответ.')], 3);
    expect(requests).toHaveLength(3);
    expect(requests[2]?.tools).toBeUndefined();
    expect(final(events).text).toBe('Ответ.');
  });

  it('with no call left for the re-ask, a failed check gives the safe phrase at once', async () => {
    const { events, requests } = await capped(ask, [say('Можно 9 г соли в день.')], 1);
    expect(requests).toHaveLength(1);
    expect(types(events)).not.toContain('status-checking');
    expect(final(events).replaced).toBe(true);
    expect(final(events).text).not.toContain('9 г');
  });

  it('skips the memory fold when it would leave no call for the answer', async () => {
    const folded = request([{ role: 'user', content: 'Привет' }], {
      fold: [
        { role: 'user', content: 'Старый вопрос' },
        { role: 'assistant', content: 'Старый ответ' },
      ],
    });
    const { events, requests } = await capped(folded, [say('Здравствуйте!')], 1);
    expect(requests).toHaveLength(1);
    expect(events.find((e) => e.type === 'memory')).toMatchObject({ memory: folded.memory });
    expect(final(events).text).toBe('Здравствуйте!');
  });
});
