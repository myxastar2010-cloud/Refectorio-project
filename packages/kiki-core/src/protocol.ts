/**
 * The chat protocol between the browser and `apps/api` (ТЗ 07 §2): one POST per step of a turn, answered with Server-Sent
 * Events. The server is stateless — the request carries the window, the memory and the context digest; a client tool
 * ends the stream with `tool-call` events plus the messages to append, and the client POSTs again with the results.
 * Unknown events are skipped by the client (forward compatibility).
 */
import { z } from 'zod';
import { MAX_USER_CHARS, wireMessageSchema, type WireMessage } from './messages';

export const PROTOCOL_VERSION = 1;
/** Tool rounds per user turn (ТЗ 07 §2). */
export const MAX_TOOL_ROUNDS = 6;
export const MAX_WINDOW_MESSAGES = 80;
export const MAX_DIGEST_CHARS = 12_000;
export const MAX_SUMMARY_CHARS = 4_000;
export const MAX_FACTS = 30;
/** Request body limit for chat (ТЗ 07 §2). */
export const MAX_BODY_BYTES = 256 * 1024;

export const memorySchema = z.object({
  /** Rolling summary of folded turns (≤ 800 tokens). */
  summary: z.string().max(MAX_SUMMARY_CHARS),
  /** Facts the person stated, one short line each («не любит пшёнку»). */
  facts: z.array(z.string().min(1).max(200)).max(MAX_FACTS),
});
export type Memory = z.infer<typeof memorySchema>;
export const EMPTY_MEMORY: Memory = { summary: '', facts: [] };

export const chatRequestSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** The client's id of this user turn (for its own bookkeeping; the server only echoes it). */
  turnId: z.string().regex(/^[a-zA-Z0-9_-]{4,64}$/),
  messages: z.array(wireMessageSchema).min(1).max(MAX_WINDOW_MESSAGES),
  memory: memorySchema,
  digest: z.string().max(MAX_DIGEST_CHARS),
  /** The oldest turns to fold into the memory before answering (one summarisation call). */
  fold: z.array(wireMessageSchema).max(MAX_WINDOW_MESSAGES).optional(),
  /** Wall-clock start of the turn on the client, ms since epoch (the turn budget spans several POSTs). */
  turnStartedAt: z.number().int().nonnegative().optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const STATUS_PHASES = [
  'thinking',
  'searching',
  'reading',
  'planning',
  'checking',
  'waking',
] as const;
export type StatusPhase = (typeof STATUS_PHASES)[number];

/** UI targets of `open_ui` (a button «Открыть …» in the chat; it never navigates by itself). */
export const UI_TARGETS = [
  'dish',
  'day',
  'search',
  'goal',
  'download',
  'restore',
  'widgets',
  'mealEdit',
  'news',
  'account',
  'privacy',
  'recipes',
] as const;
export type UiTarget = (typeof UI_TARGETS)[number];

export const ERROR_CODES = [
  'bad_request',
  'rate_limited',
  'provider_unavailable',
  'timeout',
  'too_many_rounds',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type Usage = {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly cachedTokens: number;
};

export type ChoiceUi = {
  readonly kind: 'choice';
  readonly questionRu: string;
  readonly options: readonly string[];
};
export type OpenUi = { readonly kind: 'open'; readonly target: UiTarget; readonly id?: string };
export type UiEvent = ChoiceUi | OpenUi;

export type ServerEvent =
  | { readonly type: 'status'; readonly phase: StatusPhase; readonly detail?: string }
  | { readonly type: 'text-delta'; readonly text: string }
  /** The streamed text belonged to a step that ended with tool calls: clear it. */
  | { readonly type: 'text-reset' }
  | { readonly type: 'server-tool'; readonly name: string; readonly detail?: string }
  | { readonly type: 'ui'; readonly ui: UiEvent }
  | { readonly type: 'memory'; readonly memory: Memory }
  /** Messages produced by this step (the assistant's tool calls, server tool results) to append before continuing. */
  | { readonly type: 'continue'; readonly messages: readonly WireMessage[] }
  | {
      readonly type: 'tool-call';
      readonly callId: string;
      readonly name: string;
      readonly args: unknown;
    }
  | {
      readonly type: 'final';
      readonly text: string;
      /** The streamed text was replaced after a failed check (the client swaps it quietly). */
      readonly replaced: boolean;
      /** Everything this step adds to the history (tool exchanges of UI tools and the answer itself). */
      readonly messages: readonly WireMessage[];
      readonly model: string;
      readonly usage: Usage;
    }
  | {
      readonly type: 'error';
      readonly code: ErrorCode;
      readonly retryable: boolean;
      readonly retryAfterMs?: number;
    };

export type ServerEventType = ServerEvent['type'];

/** One SSE frame: `event: <type>` + `data: <json>`. */
export function encodeEvent(event: ServerEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE parser: feed decoded text, get the complete events. Tolerates CRLF, comments (`:` lines — the
 * server's keep-alive pings) and unknown event types (returned as they are; the caller skips what it doesn't know).
 */
export function createEventParser(): (chunk: string) => ServerEvent[] {
  let buffer = '';
  return (chunk) => {
    buffer += chunk.replace(/\r\n?/g, '\n');
    const out: ServerEvent[] = [];
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      try {
        const parsed: unknown = JSON.parse(data);
        if (parsed && typeof parsed === 'object' && 'type' in parsed)
          out.push(parsed as ServerEvent);
      } catch {
        // A broken frame is skipped; the turn's own timeout reports a stalled stream.
      }
    }
    return out;
  };
}

/** Plain summary shape the summarisation step must return (strict). */
export const foldResultSchema = z.object({
  summary: z.string().max(MAX_SUMMARY_CHARS),
  facts: z.array(z.string().min(1).max(200)).max(MAX_FACTS),
});

export const userTextSchema = z.string().trim().min(1).max(MAX_USER_CHARS);
