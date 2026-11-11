/**
 * OpenAI-compatible chat completions with streaming (NVIDIA Build, ТЗ 07 §2–3; R20 §6–7): tool-call deltas are joined
 * by `index` (DeepSeek splits arguments, Mistral sends them whole); reasoning is counted but never shown; calls a model
 * writes into the text (`[TOOL_CALLS]…`, `<tool_call>…`) are recovered. Text that starts like such a call is held back,
 * so a raw call never flashes in the chat.
 */
import type { ProviderRequest, ProviderResult, ToolCall } from '@refectorio/kiki-core';
import { parseJsonLoose } from '@refectorio/kiki-core';

export type ModelSpec = {
  readonly provider: 'nvidia';
  readonly id: string;
  /** Extra body fields for this model (`reasoning_effort`, `chat_template_kwargs`…). */
  readonly extra: Readonly<Record<string, unknown>>;
};

export const PROVIDER_BASE: Record<ModelSpec['provider'], string> = {
  nvidia: 'https://integrate.api.nvidia.com/v1',
};

export class ProviderError extends Error {
  constructor(
    readonly code: 'timeout' | 'http' | 'network' | 'empty' | 'aborted',
    readonly status: number | null,
    /** Visible text already went to the person: another model can't take over silently. */
    readonly streamed: boolean,
    message: string,
  ) {
    super(message);
  }
}

export type StreamOptions = {
  readonly model: ModelSpec;
  readonly key: string;
  readonly request: ProviderRequest;
  readonly fetchImpl?: typeof fetch;
  readonly firstByteTimeoutMs: number;
  readonly stallTimeoutMs: number;
  readonly signal?: AbortSignal;
  readonly temperature?: number;
};

const value = (raw: string): unknown => {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
};

/**
 * `AI_PROVIDERS`: comma-separated `nvidia:<model id>[?key=value&…]`; `ctk.<name>=…` goes to `chat_template_kwargs`.
 * Example: `nvidia:mistralai/mistral-large-4-1t-a52b?reasoning_effort=low,nvidia:nvidia/nemotron-3.5-super-vl-120b-a12b`.
 */
export function parseProviders(spec: string): ModelSpec[] {
  const out: ModelSpec[] = [];
  for (const part of spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^(nvidia):([^?\s]+)(?:\?(.*))?$/.exec(part);
    if (!m?.[1] || !m[2]) throw new Error(`AI_PROVIDERS: bad entry «${part}»`);
    const extra: Record<string, unknown> = {};
    const ctk: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(m[3] ?? '')) {
      if (k.startsWith('ctk.')) ctk[k.slice(4)] = value(v);
      else extra[k] = value(v);
    }
    if (Object.keys(ctk).length > 0) extra.chat_template_kwargs = ctk;
    out.push({ provider: 'nvidia', id: m[2], extra });
  }
  return out;
}

const CALL_MARKERS = [
  '[TOOL_CALLS]',
  '<tool_call>',
  '<|tool_call',
  '```json',
  '{"name"',
  '[{"name"',
];
const looksLikeCallStart = (text: string) =>
  CALL_MARKERS.some((m) => m.startsWith(text.trimStart()) || text.trimStart().startsWith(m));

let fallbackCounter = 0;
const fallbackId = () => `k${(++fallbackCounter).toString(36).padStart(8, '0')}`.slice(-9);

/** Tool calls written as text (R20: some models do this): returns the calls or null. */
export function recoverToolCalls(content: string): ToolCall[] | null {
  let text = content.trim();
  if (!text) return null;
  text = text
    .replace(/^\[TOOL_CALLS\]/, '')
    .replace(/<\/?tool_call>/g, '')
    .replace(/<\|tool_call[^|]*\|>/g, '')
    .trim();
  const parsed = parseJsonLoose(text.startsWith('[') ? `{"calls":${text}}` : text);
  if (!parsed || typeof parsed !== 'object') return null;
  const list: unknown[] = Array.isArray((parsed as { calls?: unknown }).calls)
    ? (parsed as { calls: unknown[] }).calls
    : [parsed];
  const calls: ToolCall[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') return null;
    const { name, arguments: args, parameters } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !/^[a-z_]{2,40}$/.test(name)) return null;
    const a = args ?? parameters ?? {};
    calls.push({ id: fallbackId(), name, args: typeof a === 'string' ? a : JSON.stringify(a) });
  }
  return calls.length > 0 ? calls : null;
}

type Delta = {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: {
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
};

export async function streamChat(options: StreamOptions): Promise<ProviderResult> {
  const { model, key, request } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  options.signal?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Written inside callbacks: an object, so the compiler does not narrow them to their first value.
  const flags = { timedOut: false, streamed: false, holding: true };
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      flags.timedOut = true;
      controller.abort();
    }, ms);
  };

  let content = '';
  let held = '';
  const calls: { id: string; name: string; args: string }[] = [];
  let usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
  let servedModel = model.id;

  const flushText = (text: string) => {
    if (!request.onText) return;
    if (flags.holding) {
      held += text;
      // Wait until the start of the text shows whether it is a call written as text.
      if (looksLikeCallStart(held) && held.length < 24) return;
      flags.holding = false;
      if (looksLikeCallStart(held)) return;
      flags.streamed = true;
      request.onText(held);
      return;
    }
    if (looksLikeCallStart(held)) return;
    flags.streamed = true;
    request.onText(text);
  };

  try {
    arm(options.firstByteTimeoutMs);
    const res = await fetchImpl(`${PROVIDER_BASE[model.provider]}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: model.id,
        messages: request.messages,
        ...(request.tools && request.tools.length > 0
          ? { tools: request.tools, tool_choice: 'auto' }
          : {}),
        ...(request.jsonOnly ? { response_format: { type: 'json_object' } } : {}),
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: request.maxTokens,
        temperature: options.temperature ?? 0.3,
        ...model.extra,
      }),
    });
    if (!res.ok || !res.body) {
      throw new ProviderError('http', res.status, false, `HTTP ${res.status}`);
    }
    request.onFirstByte?.();
    arm(options.stallTimeoutMs);
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      arm(options.stallTimeoutMs);
      buffer += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let json: {
          model?: string;
          choices?: { delta?: Delta }[];
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number } | null;
          } | null;
        };
        try {
          json = JSON.parse(data) as typeof json;
        } catch {
          continue;
        }
        if (json.model) servedModel = json.model;
        if (json.usage)
          usage = {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            cachedTokens: json.usage.prompt_tokens_details?.cached_tokens ?? 0,
          };
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.content) {
          content += delta.content;
          flushText(delta.content);
        }
        for (const call of delta.tool_calls ?? []) {
          const slot = (calls[call.index ?? 0] ??= { id: '', name: '', args: '' });
          if (call.id && !slot.id) slot.id = call.id;
          if (call.function?.name) slot.name += call.function.name;
          if (call.function?.arguments) slot.args += call.function.arguments;
        }
      }
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (flags.timedOut) throw new ProviderError('timeout', null, flags.streamed, 'timeout');
    if (options.signal?.aborted)
      throw new ProviderError('aborted', null, flags.streamed, 'aborted');
    throw new ProviderError(
      'network',
      null,
      flags.streamed,
      error instanceof Error ? error.message : 'network',
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }

  // A short answer may never have left the hold-back buffer.
  if (flags.holding && held && !looksLikeCallStart(held) && request.onText) {
    flags.streamed = true;
    request.onText(held);
  }
  let toolCalls: ToolCall[] = calls
    .filter((c) => c.name)
    .map((c) => ({ id: c.id || fallbackId(), name: c.name, args: c.args }));
  if (toolCalls.length === 0 && looksLikeCallStart(content)) {
    const recovered = recoverToolCalls(content);
    if (recovered) toolCalls = recovered;
    // A call written as text that could not be read is never shown as an answer (raw JSON): the text is dropped,
    // and with nothing else the next model in the chain answers (review of phase 5, minor 10).
    content = '';
  }
  if (!content.trim() && toolCalls.length === 0)
    throw new ProviderError('empty', null, flags.streamed, 'empty answer');
  return { content, toolCalls, model: servedModel, usage };
}
