/**
 * Kiki's chat in the browser (ТЗ 07 §2, §5, §10, §12): one chat, kept on this device. A turn: the user message → POST to
 * the server with the window, the memory and a fresh digest → SSE events (status, streamed text, UI chips) → client
 * tools run in the menu worker and go back in the next POST → the final answer. The model sees a token-budgeted window;
 * older turns fold into the memory by the server. Everything the UI needs is one immutable state + subscribe.
 */
import {
  createEventParser,
  EMPTY_MEMORY,
  estimateTokens,
  MAX_WINDOW_MESSAGES,
  messageTokens,
  PROTOCOL_VERSION,
  repairWire,
  type ChatRequest,
  type ErrorCode,
  type Memory,
  type OpenUi,
  type ServerEvent,
  type StatusPhase,
  type WireMessage,
} from '@refectorio/kiki-core';
import type { MealChange, Preview, PreviewOp, PreviewStats } from '@refectorio/kiki-core/client';

export type ChoiceItem = {
  readonly question: string;
  readonly options: readonly string[];
  readonly picked?: string;
};

export type ChatItem =
  | { readonly id: string; readonly kind: 'user'; readonly text: string }
  | {
      readonly id: string;
      readonly kind: 'kiki';
      readonly text: string;
      readonly replaced?: boolean;
      readonly choice?: ChoiceItem;
      readonly buttons?: readonly OpenUi[];
      readonly previews?: readonly string[];
    }
  | { readonly id: string; readonly kind: 'note'; readonly text: string }
  | {
      readonly id: string;
      readonly kind: 'error';
      readonly code: ErrorCode | 'offline' | 'stopped';
      readonly retryAfterMs?: number;
      /** The user text to send again. */
      readonly retry?: string;
    };

export type PreviewRecord = {
  readonly id: string;
  readonly kind: PreviewOp['kind'];
  readonly op: PreviewOp;
  readonly summaryRu: string;
  readonly stats: PreviewStats;
  readonly rulesAdded: readonly string[];
  readonly rulesRemoved: readonly string[];
  readonly mealChanges: readonly MealChange[];
  readonly baseRevision: number;
  /** planKey of the menu it was computed from (absent in chats saved before 11.11: compared by revision). */
  readonly baseKey?: string;
  /** The proposing call, re-run on a changed menu (Preview.call). */
  readonly call?: { readonly name: string; readonly args: unknown };
  readonly status: 'pending' | 'applied' | 'dismissed';
};

export type Busy = {
  readonly phase: StatusPhase;
  readonly detail?: string;
  readonly startedAt: number;
  /** Text streamed so far (cleared when the step turns to tools). */
  readonly text: string;
};

export type ChatState = {
  readonly items: readonly ChatItem[];
  /** The model's history (OpenAI-shaped); pairs of tool calls and results always intact. */
  readonly wire: readonly WireMessage[];
  readonly memory: Memory;
  /** Wire messages before this index are already in the memory. */
  readonly folded: number;
  readonly previews: Readonly<Record<string, PreviewRecord>>;
  readonly busy: Busy | null;
};

export const EMPTY_CHAT: ChatState = {
  items: [],
  wire: [],
  memory: EMPTY_MEMORY,
  folded: 0,
  previews: {},
  busy: null,
};

export const MAX_ITEMS = 1000;
export const MAX_WIRE = 400;
/** Window budget: the rest of the ≈ 10k context is the prompt, knowledge, digest and memory (ТЗ 07 §4). */
export const WINDOW_TOKENS = 2800;
export const WINDOW_TURNS = 8;
/** Tool results of earlier turns are cut to this in the window (their numbers are not grounding for a new turn). */
export const OLD_TOOL_CHARS = 500;
/** No first byte after this → «Кики просыпается…» (Render's free instance sleeps). */
export const WAKING_AFTER_MS = 3000;
/** The server has not even answered with headers after this → «Кики сейчас недоступна» (a cold start takes 30–60 s). */
export const WAKE_GIVE_UP_MS = 100_000;
/** After the headers, no end of the step after this → «Кики сейчас недоступна» (review of phase 5, M7). */
export const GIVE_UP_MS = 65_000;
export const MAX_STEPS = 10;

export type ToolRun = { readonly result: unknown; readonly previews: readonly Preview[] };

export type SessionDeps = {
  readonly post: (body: ChatRequest, signal: AbortSignal) => Promise<Response>;
  readonly runTool: (name: string, args: unknown) => Promise<ToolRun>;
  readonly digest: () => Promise<string>;
  readonly persist: (state: ChatState) => void;
  readonly now: () => number;
  readonly newId: () => string;
  readonly online: () => boolean;
  /** Called with each completed sentence of the streamed answer (polite live region). */
  readonly announce?: (text: string) => void;
};

/** Window + fold for a request: the whole current turn, then earlier turns while they fit (ТЗ 07 §5). */
export function selectWindow(
  wire: readonly WireMessage[],
  folded: number,
  budget = WINDOW_TOKENS,
  maxTurns = WINDOW_TURNS,
): { messages: WireMessage[]; fold: WireMessage[]; start: number } {
  const starts: number[] = [];
  wire.forEach((m, i) => {
    if (m.role === 'user') starts.push(i);
  });
  const last = starts.at(-1) ?? 0;
  let start = last;
  let used = wire.slice(last).reduce((n, m) => n + messageTokens(m), 0);
  for (let t = starts.length - 2, turns = 1; t >= 0 && turns < maxTurns; t--, turns++) {
    const from = starts[t] ?? 0;
    const cost = wire
      .slice(from, start)
      .reduce((n, m) => n + messageTokens(m.role === 'tool' ? shorten(m) : m), 0);
    if (used + cost > budget) break;
    used += cost;
    start = from;
  }
  // The server takes at most MAX_WINDOW_MESSAGES in each part (review of phase 5, minor 6): whole earlier turns go
  // first; the fold needs no tool results (the summary reads only the words), so it loses those and then its oldest.
  while (start < last && wire.length - start > MAX_WINDOW_MESSAGES) {
    const next = wire.findIndex((m, i) => i > start && m.role === 'user');
    if (next < 0 || next > last) break;
    start = next;
  }
  const messages = wire
    .slice(start)
    .map((m, i) => (start + i < last && m.role === 'tool' ? shorten(m) : m));
  const fold =
    start - folded >= 2
      ? wire
          .slice(folded, start)
          .filter((m) => m.role !== 'tool' && m.content.trim() !== '')
          .map((m) => (m.role === 'assistant' ? { role: m.role, content: m.content } : m))
          .slice(-MAX_WINDOW_MESSAGES)
      : [];
  return { messages, fold, start };
}

const shorten = (m: WireMessage): WireMessage =>
  m.role === 'tool' && m.content.length > OLD_TOOL_CHARS
    ? { ...m, content: `${m.content.slice(0, OLD_TOOL_CHARS)}…` }
    : m;

export type ChatSession = {
  get(): ChatState;
  subscribe(listener: () => void): () => void;
  send(text: string): Promise<void>;
  retry(errorId: string): Promise<void>;
  stop(): void;
  pick(itemId: string, option: string): Promise<void>;
  /** Marks a preview applied / dismissed and adds a note («Применено»). */
  settle(previewId: string, status: 'applied' | 'dismissed', note?: string): void;
  clear(): void;
  restore(state: ChatState): void;
};

export function createChatSession(deps: SessionDeps, initial: ChatState = EMPTY_CHAT): ChatSession {
  let state = initial;
  const listeners = new Set<() => void>();
  let controller: AbortController | null = null;
  let emitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Where the running turn began in the wire: what is saved never holds half a turn (review of phase 5, M8). */
  let runningFrom: number | null = null;
  /** Bumped by «Удалить мои данные»: a run of an older generation writes nothing (review minor 3). */
  let generation = 0;

  const emitNow = () => {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = null;
    for (const l of listeners) l();
  };
  /** Streamed text changes many times a second: coalesce re-renders. */
  const emitSoon = () => {
    emitTimer ??= setTimeout(emitNow, 50);
  };
  const set = (next: ChatState, soon = false) => {
    state = next;
    if (soon) emitSoon();
    else emitNow();
  };
  const save = () => {
    const items = state.items.slice(-MAX_ITEMS);
    let wire = state.wire;
    let folded = state.folded;
    if (runningFrom === null) {
      // Never cut the wire inside a turn: drop whole oldest turns (they are in the memory or forgotten on purpose).
      while (wire.length > MAX_WIRE) {
        const next = wire.findIndex((m, i) => i > 0 && m.role === 'user');
        if (next <= 0) break;
        wire = wire.slice(next);
        folded = Math.max(0, folded - next);
      }
      state = { ...state, items, wire, folded };
      deps.persist(state);
      return;
    }
    // A turn is running (a card applied meanwhile): save the history up to its start; the turn saves itself at the end.
    state = { ...state, items };
    deps.persist({
      ...state,
      wire: wire.slice(0, runningFrom),
      folded: Math.min(folded, runningFrom),
    });
  };
  async function run(turnStart: number, userText: string): Promise<void> {
    const mine = new AbortController();
    controller = mine;
    const { signal } = mine;
    const gen = generation;
    const live = () => gen === generation;
    // Every write of this run goes through these: after «Удалить мои данные» it writes nothing.
    const setLive = (next: ChatState, soon = false) => {
      if (live()) set(next, soon);
    };
    const saveLive = () => {
      if (live()) save();
    };
    runningFrom = turnStart;
    const startedAt = deps.now();
    setLive({ ...state, busy: { phase: 'thinking', startedAt, text: '' } });
    const previewIds: string[] = [];
    let choice: ChoiceItem | undefined;
    const buttons: OpenUi[] = [];
    let announced = 0;

    const fail = (code: Extract<ChatItem, { kind: 'error' }>['code'], retryAfterMs?: number) => {
      runningFrom = null;
      // The unfinished turn leaves the model's history: a half tool exchange would break the next request. A refused
      // history (400) is repaired — its broken turns go, the rest stays (M8).
      const kept = state.wire.slice(0, turnStart);
      const repaired = code === 'bad_request' ? repairWire(kept, state.folded) : null;
      setLive({
        ...state,
        wire: repaired ? repaired.wire : kept,
        folded: repaired ? repaired.folded : Math.min(state.folded, kept.length),
        busy: null,
        items: [
          ...state.items,
          {
            id: deps.newId(),
            kind: 'error',
            code,
            ...(retryAfterMs ? { retryAfterMs } : {}),
            ...(code === 'stopped' ? {} : { retry: userText }),
          },
        ],
      });
      saveLive();
    };

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        if (!deps.online()) {
          fail('offline');
          return;
        }
        const digest = await deps.digest();
        const { messages, fold, start } = selectWindow(state.wire, state.folded);
        const body: ChatRequest = {
          v: PROTOCOL_VERSION,
          turnId: `turn-${turnStart.toString(36)}-${step}`,
          messages,
          memory: state.memory,
          digest,
          ...(fold.length > 0 ? { fold } : {}),
          // A duration by this tab's monotonic clock: the server never compares clocks (review of phase 5, M5).
          turnElapsedMs: Math.max(0, Math.round(deps.now() - startedAt)),
        };
        const waking = setTimeout(() => {
          if (state.busy) setLive({ ...state, busy: { ...state.busy, phase: 'waking' } });
        }, WAKING_AFTER_MS);
        // Two limits (M7): a sleeping server gets time to wake before its headers, then the step gets its own time.
        // The timer stops this run's own request, never a later one (M6).
        let giveUp = setTimeout(() => {
          mine.abort('timeout');
        }, WAKE_GIVE_UP_MS);
        let res: Response;
        try {
          res = await deps.post(body, signal);
        } finally {
          clearTimeout(waking);
          clearTimeout(giveUp);
        }
        giveUp = setTimeout(() => {
          mine.abort('timeout');
        }, GIVE_UP_MS);
        if (!res.ok || !res.body) {
          clearTimeout(giveUp);
          let retryAfterMs: number | undefined;
          try {
            const json = (await res.json()) as { retryAfterMs?: number };
            retryAfterMs = json.retryAfterMs;
          } catch {
            // no JSON body
          }
          fail(
            res.status === 429
              ? 'rate_limited'
              : // 404/405: no Kiki server at that address (not deployed yet, a wrong address) — «недоступна», not «не
                // получилось»: the person can do nothing about it but wait.
                res.status >= 500 || res.status === 404 || res.status === 405
                ? 'provider_unavailable'
                : 'bad_request',
            retryAfterMs,
          );
          return;
        }
        if (state.busy?.phase === 'waking')
          setLive({ ...state, busy: { ...state.busy, phase: 'thinking' } });

        const parse = createEventParser();
        const decoder = new TextDecoder();
        const calls: Extract<ServerEvent, { type: 'tool-call' }>[] = [];
        let finished = false;
        const reader = res.body.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const event of parse(decoder.decode(value, { stream: true }))) {
              const busy = state.busy;
              switch (event.type) {
                case 'status':
                  if (busy)
                    setLive({
                      ...state,
                      busy: {
                        ...busy,
                        phase: event.phase,
                        ...(event.detail ? { detail: event.detail } : {}),
                      },
                    });
                  break;
                case 'text-delta':
                  if (busy) {
                    const text = busy.text + event.text;
                    setLive({ ...state, busy: { ...busy, text } }, true);
                    // Completed sentences go to the polite live region, one by one.
                    const end = Math.max(
                      text.lastIndexOf('. '),
                      text.lastIndexOf('! '),
                      text.lastIndexOf('? '),
                    );
                    if (end > announced) {
                      deps.announce?.(text.slice(announced, end + 1).trim());
                      announced = end + 1;
                    }
                  }
                  break;
                case 'text-reset':
                  announced = 0;
                  if (busy) setLive({ ...state, busy: { ...busy, text: '' } });
                  break;
                case 'ui':
                  if (event.ui.kind === 'choice')
                    choice = { question: event.ui.questionRu, options: event.ui.options };
                  else buttons.push(event.ui);
                  break;
                case 'memory':
                  setLive({ ...state, memory: event.memory, folded: start });
                  break;
                case 'continue':
                  setLive({ ...state, wire: [...state.wire, ...event.messages] });
                  break;
                case 'tool-call':
                  calls.push(event);
                  break;
                case 'final': {
                  finished = true;
                  const item: ChatItem = {
                    id: deps.newId(),
                    kind: 'kiki',
                    text: event.text,
                    ...(event.replaced ? { replaced: true } : {}),
                    ...(choice ? { choice } : {}),
                    ...(buttons.length > 0 ? { buttons } : {}),
                    ...(previewIds.length > 0 ? { previews: previewIds } : {}),
                  };
                  if (event.replaced) deps.announce?.(event.text);
                  else if (announced < event.text.length)
                    deps.announce?.(event.text.slice(announced).trim());
                  runningFrom = null;
                  setLive({
                    ...state,
                    wire: [...state.wire, ...event.messages],
                    items: [...state.items, item],
                    busy: null,
                  });
                  saveLive();
                  break;
                }
                case 'error':
                  finished = true;
                  clearTimeout(giveUp);
                  fail(event.code, event.retryAfterMs);
                  return;
                default:
                  // An event this client doesn't know (a newer server): skipped.
                  break;
              }
            }
          }
        } finally {
          clearTimeout(giveUp);
          reader.releaseLock();
        }
        if (finished) return;
        if (calls.length === 0) {
          fail('internal');
          return;
        }
        if (state.busy)
          setLive({
            ...state,
            busy: {
              ...state.busy,
              phase: calls.some((c) => c.name.startsWith('propose_')) ? 'planning' : 'thinking',
              text: '',
            },
          });
        const results: WireMessage[] = [];
        for (const call of calls) {
          const out = await deps.runTool(call.name, call.args);
          let previews = state.previews;
          for (const p of out.previews) {
            previewIds.push(p.id);
            previews = {
              ...previews,
              [p.id]: {
                id: p.id,
                kind: p.op.kind,
                op: p.op,
                summaryRu: p.summaryRu,
                stats: p.stats,
                rulesAdded: p.rulesAdded,
                rulesRemoved: p.rulesRemoved,
                mealChanges: p.mealChanges,
                baseRevision: p.baseRevision,
                baseKey: p.baseKey,
                ...(p.call ? { call: p.call } : {}),
                status: 'pending',
              },
            };
          }
          if (live()) state = { ...state, previews };
          results.push({
            role: 'tool',
            callId: call.callId,
            name: call.name,
            content: JSON.stringify(out.result).slice(0, 6000),
          });
        }
        setLive({ ...state, wire: [...state.wire, ...results] });
      }
      fail('too_many_rounds');
    } catch {
      if (signal.aborted) fail(signal.reason === 'timeout' ? 'timeout' : 'stopped');
      else fail(deps.online() ? 'provider_unavailable' : 'offline');
    } finally {
      // Only this run's own controller: a later turn keeps its «Стоп» and timer (M6).
      if (controller === mine) controller = null;
    }
  }

  const sendText = async (text: string, showUser: boolean) => {
    const clean = text.trim();
    if (!clean || state.busy) return;
    const turnStart = state.wire.length;
    set({
      ...state,
      items: showUser
        ? [...state.items, { id: deps.newId(), kind: 'user', text: clean }]
        : state.items,
      wire: [...state.wire, { role: 'user', content: clean.slice(0, 4000) }],
    });
    await run(turnStart, clean);
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: (text) => sendText(text, true),
    async retry(errorId) {
      const item = state.items.find((i) => i.id === errorId);
      if (item?.kind !== 'error' || !item.retry) return;
      set({ ...state, items: state.items.filter((i) => i.id !== errorId) });
      await sendText(item.retry, false);
    },
    stop() {
      controller?.abort('stop');
    },
    async pick(itemId, option) {
      if (state.busy) return;
      set({
        ...state,
        items: state.items.map((i) =>
          i.id === itemId && i.kind === 'kiki' && i.choice
            ? { ...i, choice: { ...i.choice, picked: option } }
            : i,
        ),
      });
      await sendText(option, true);
    },
    settle(previewId, status, note) {
      const record = state.previews[previewId];
      if (!record) return;
      set({
        ...state,
        previews: { ...state.previews, [previewId]: { ...record, status } },
        items: note
          ? [...state.items, { id: deps.newId(), kind: 'note', text: note }]
          : state.items,
      });
      save();
    },
    clear() {
      generation++;
      runningFrom = null;
      controller?.abort('stop');
      controller = null;
      set({ ...EMPTY_CHAT });
      deps.persist(state);
    },
    restore(next) {
      set(next);
    },
  };
}

export const tokensOf = estimateTokens;
