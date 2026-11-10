import { describe, expect, it } from 'vitest';
import kbJson from '../knowledge/kb.json';
import { createKb, kbFileSchema, parseCard, parseGuide, stableKbVersion } from './knowledge';
import { pairingProblem, toolRoundsInTurn, turnStart, type WireMessage } from './messages';
import { contextBlock, SYSTEM_PROMPT_TOKENS } from './prompt';
import { createEventParser, encodeEvent, type ServerEvent } from './protocol';
import {
  isToolName,
  parseJsonLoose,
  parseToolArgs,
  providerTools,
  TOOL_NAMES,
  MEAL_KINDS,
} from './tools';
import { MEAL_KINDS as ENGINE_MEALS } from '@refectorio/menu-core';

describe('protocol', () => {
  it('encodes and parses SSE frames across chunk borders, skipping pings and junk', () => {
    const events: ServerEvent[] = [
      { type: 'status', phase: 'thinking' },
      { type: 'text-delta', text: 'При\nвет' },
      { type: 'error', code: 'timeout', retryable: true },
    ];
    const wire = `: ping\n\n${events.map(encodeEvent).join('')}data: {broken\n\n`;
    const parse = createEventParser();
    const out: ServerEvent[] = [];
    for (let i = 0; i < wire.length; i += 7) out.push(...parse(wire.slice(i, i + 7)));
    expect(out).toEqual(events);
    expect(createEventParser()('event: x\r\ndata: {"type":"text-reset"}\r\n\r\n')).toEqual([
      { type: 'text-reset' },
    ]);
  });
});

describe('messages', () => {
  const window: WireMessage[] = [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'user', content: 'c' },
    { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'get_menu', args: '{}' }] },
    { role: 'tool', callId: '1', name: 'get_menu', content: '{}' },
  ];
  it('finds the turn start and counts tool rounds', () => {
    expect(turnStart(window)).toBe(2);
    expect(toolRoundsInTurn(window)).toBe(1);
    expect(turnStart([])).toBe(-1);
  });
  it('checks tool call / result pairing', () => {
    expect(pairingProblem(window)).toBeNull();
    expect(pairingProblem(window.slice(0, 4))).toBeNull();
    expect(pairingProblem([...window.slice(0, 4), { role: 'user', content: 'x' }])).toContain(
      'unanswered',
    );
    expect(
      pairingProblem([{ role: 'tool', callId: '9', name: 'get_menu', content: '' }]),
    ).toContain('without its call');
    expect(pairingProblem([...window.slice(0, 4), { role: 'assistant', content: 'x' }])).toContain(
      'unanswered',
    );
  });
});

describe('tools', () => {
  it('every tool has a JSON schema; names are known', () => {
    const tools = providerTools();
    expect(tools.map((t) => t.function.name)).toEqual(TOOL_NAMES);
    for (const t of tools) {
      expect(t.function.parameters.type).toBe('object');
      expect(JSON.stringify(t.function.parameters)).not.toContain('$schema');
    }
    expect(providerTools()).toBe(tools);
    expect(isToolName('get_menu')).toBe(true);
    expect(isToolName('rm_rf')).toBe(false);
  });
  it('meal kinds match the engine', () => {
    expect([...MEAL_KINDS]).toEqual([...ENGINE_MEALS]);
  });
  it('parses loose JSON and reports schema problems', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('вот: {"a":2} — готово')).toEqual({ a: 2 });
    expect(parseJsonLoose('')).toEqual({});
    expect(parseJsonLoose('{oops')).toBeNull();
    expect(parseJsonLoose('{a} b {c}')).toBeNull();
    const bad = parseToolArgs('find_in_menu', '{"query":""}');
    expect(bad.ok ? '' : bad.error).toContain('query');
    expect(parseToolArgs('propose_menu_change', '{"reasonRu":"x y"}')).toMatchObject({
      ok: true,
      args: { rules: [] },
    });
  });
});

describe('prompt', () => {
  it('stays within 3k tokens; context includes memory and knowledge only when present', () => {
    expect(SYSTEM_PROMPT_TOKENS).toBeLessThanOrEqual(3000);
    const empty = contextBlock({ knowledge: '', digest: '', memory: { summary: '', facts: [] } });
    expect(empty).toContain('нет данных о меню');
    expect(empty).not.toContain('MEMORY');
    const full = contextBlock({
      knowledge: 'K',
      digest: 'D',
      memory: { summary: 'S', facts: ['F'] },
    });
    expect(full).toContain('- F\nS');
    expect(full).toContain('KNOWLEDGE');
  });
});

describe('knowledge', () => {
  const file = kbFileSchema.parse(kbJson);
  const kb = createKb(file);
  it('the built base finds how-to and science answers', () => {
    expect(kb.size).toBeGreaterThan(80);
    expect(kb.search('как скачать меню')[0]?.doc.kind).toBe('guide');
    expect(kb.search('можно ли есть яйца каждый день').map((h) => h.doc.id)).toContain(
      'science-eggs-every-day',
    );
    expect(kb.search('сколько будет 3+64')).toEqual([]);
    expect(kb.search('и в на')).toEqual([]);
    const ctx = kb.context('сколько соли можно в день', 400);
    expect(ctx.ids.length).toBeGreaterThan(0);
    expect(ctx.text.length / 3).toBeLessThanOrEqual(400);
  });
  it('parses the guide and cards; the version follows the content', () => {
    expect(parseGuide('# T\n\n## a · Заголовок\nТекст\n\n## bad\n\n## c · Пусто\n')).toEqual([
      { id: 'guide-a', kind: 'guide', title: 'Заголовок', tags: [], sources: [], text: 'Текст' },
    ]);
    const card = parseCard(
      '---\nid: x\ntitle: Икс\ntags: [а, «б»]\nsources: [R1]\n---\nТекст карточки.',
    );
    expect(card).toMatchObject({ id: 'science-x', tags: ['а', 'б'], sources: ['R1'] });
    expect(parseCard('no front matter')).toBeNull();
    expect(parseCard('---\ntitle: без id\n---\nx')).toBeNull();
    expect(stableKbVersion(file.docs)).toBe(file.version);
  });
});
