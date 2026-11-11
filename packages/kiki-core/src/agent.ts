/**
 * One step of a Kiki turn (ТЗ 07 §2): the server's whole logic without the network. The model is injected
 * (`complete` — the provider chain on the server, a recording or a live model in evals), events go out through `emit`.
 * Stateless: everything comes in the request; a client tool ends the step with `continue` + `tool-call` events.
 *   fold old turns → context (prompt + knowledge + digest + memory) → model ⇄ server/UI tools → client tools → stop;
 *   or a final text → checks → one corrective re-ask → fallback.
 */
import type { Kb } from './knowledge';
import { formatDoc } from './knowledge';
import {
  MAX_ASSISTANT_CHARS,
  MAX_TOOL_CHARS,
  toolRoundsInTurn,
  turnStart,
  type ToolCall,
  type WireMessage,
} from './messages';
import { FOLD_PROMPT, SYSTEM_PROMPT, contextBlock } from './prompt';
import {
  foldResultSchema,
  MAX_TOOL_ROUNDS,
  type ChatRequest,
  type Memory,
  type ServerEvent,
  type Usage,
} from './protocol';
import {
  isToolName,
  parseJsonLoose,
  parseToolArgs,
  providerTools,
  toolKind,
  type ProviderTool,
  type ToolName,
} from './tools';
import { extractQuantities, isGrounded } from './numbers';
import {
  correctionPrompt,
  fallbackAnswer,
  groundingPool,
  sanitizeMarkdown,
  validateAnswer,
  type GroundingSources,
  type Issue,
} from './validate';

/** Checks that matter for chips and short questions (length and language do not). */
const SHORT_TEXT_CODES = new Set<Issue['code']>([
  'ungroundedNumber',
  'identity',
  'diagnosis',
  'dosing',
  'link',
]);
const shortTextIssues = (texts: readonly string[], sources: GroundingSources): Issue[] =>
  texts.flatMap((t) => validateAnswer(t, sources)).filter((i) => SHORT_TEXT_CODES.has(i.code));

/** Keys whose text the model wrote itself: never a source for grounding (review of phase 5, M3). */
const ECHO_KEYS = new Set([
  'term',
  'terms',
  'textRu',
  'summaryRu',
  'reasonRu',
  'rulesAdded',
  'rulesRemoved',
  'questionRu',
]);
function withoutEcho(content: string): string {
  try {
    return JSON.stringify(
      JSON.parse(content, (key: string, value: unknown) =>
        ECHO_KEYS.has(key) ? undefined : value,
      ),
    );
  } catch {
    return content;
  }
}

/**
 * Numbers a proposal would make the engine hold (a rule's amount, its label, a target weight) must come from the
 * person's words, tool results or the digest — the model never picks an amount itself (review of phase 5, M3).
 */
function proposalNumbers(
  name: string,
  args: unknown,
): { value: number; raw: string; unit: string }[] {
  const out: { value: number; raw: string; unit: string }[] = [];
  const a = args as {
    rules?: { value?: number; textRu?: string; nutrient?: string }[];
    targetWeightKg?: number;
  };
  if (name === 'propose_menu_change')
    for (const r of a.rules ?? []) {
      if (typeof r.value === 'number')
        out.push({
          value: r.value,
          raw: String(r.value),
          unit: r.nutrient === 'energyKcal' ? 'kcal' : 'g',
        });
      for (const q of extractQuantities(r.textRu ?? ''))
        out.push({ value: q.value, raw: q.raw, unit: q.unit });
    }
  if (name === 'propose_goal_change' && typeof a.targetWeightKg === 'number')
    out.push({ value: a.targetWeightKg, raw: `${String(a.targetWeightKg)} кг`, unit: 'kg' });
  return out;
}

export type ProviderMessage =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string | null;
      readonly tool_calls?: readonly {
        readonly id: string;
        readonly type: 'function';
        readonly function: { readonly name: string; readonly arguments: string };
      }[];
    }
  | {
      readonly role: 'tool';
      readonly tool_call_id: string;
      readonly name: string;
      readonly content: string;
    };

export type ProviderRequest = {
  readonly messages: readonly ProviderMessage[];
  readonly tools?: readonly ProviderTool[];
  readonly maxTokens: number;
  /** Streams visible text as it comes (only for steps that may become the answer). */
  readonly onText?: (text: string) => void;
  /** Called once when the provider starts answering (the first byte): «Кики просыпается…» ends there. */
  readonly onFirstByte?: () => void;
  readonly jsonOnly?: boolean;
};

export type ProviderResult = {
  readonly content: string;
  readonly toolCalls: readonly ToolCall[];
  readonly model: string;
  readonly usage: Usage;
};

export type Complete = (request: ProviderRequest) => Promise<ProviderResult>;

export type AgentDeps = {
  readonly complete: Complete;
  readonly kb: Kb;
  readonly now: () => number;
  /** Tools offered to the model (Part I by default). */
  readonly tools?: readonly ToolName[];
  /** Wall-clock budget of a whole turn (ТЗ 07 §2: 45 s without web search). */
  readonly turnBudgetMs?: number;
  readonly maxTokens?: number;
};

export const TURN_BUDGET_MS = 45_000;
export const DEFAULT_MAX_TOKENS = 1536;
/** Tool results are cut to this many characters before they go back to the model (compact outputs, ТЗ 07 §6). */
export const TOOL_RESULT_CHARS = 6000;

const ZERO: Usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
const addUsage = (a: Usage, b: Usage): Usage => ({
  promptTokens: a.promptTokens + b.promptTokens,
  completionTokens: a.completionTokens + b.completionTokens,
  cachedTokens: a.cachedTokens + b.cachedTokens,
});

export function toProviderMessages(
  system: string,
  messages: readonly WireMessage[],
): ProviderMessage[] {
  const out: ProviderMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'tool')
      out.push({ role: 'tool', tool_call_id: m.callId, name: m.name, content: m.content });
    else if (m.toolCalls && m.toolCalls.length > 0)
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function' as const,
          function: { name: c.name, arguments: c.args },
        })),
      });
    else out.push({ role: 'assistant', content: m.content });
  }
  return out;
}

/** Sources of this turn for the grounding check: tool results since the last user message, the digest, user words. */
export function groundingSources(
  messages: readonly WireMessage[],
  digest: string,
  extra: { readonly knowledge?: string; readonly memory?: Memory } = {},
): GroundingSources {
  const start = Math.max(0, turnStart(messages));
  const toolResults: string[] = [];
  const userTexts: string[] = [];
  for (let i = start; i < messages.length; i++) {
    const m = messages[i];
    if (m?.role === 'tool') toolResults.push(withoutEcho(m.content));
    if (m?.role === 'user') userTexts.push(m.content);
  }
  if (extra.knowledge) toolResults.push(extra.knowledge);
  // Pinned facts are the person's own; the rolling summary is the model's prose — never a source (M3).
  if (extra.memory) userTexts.push(extra.memory.facts.join('\n'));
  return { toolResults, digest, userTexts };
}

/** The same call twice in one step (R20 §6.3: `required` may duplicate) runs once. */
function dedupe(calls: readonly ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = `${c.name}\u0000${c.args.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const toolResult = (call: ToolCall, value: unknown): WireMessage => ({
  role: 'tool',
  callId: call.id,
  name: call.name,
  content: (typeof value === 'string' ? value : JSON.stringify(value)).slice(0, MAX_TOOL_CHARS),
});

function lastUserText(messages: readonly WireMessage[]): string {
  const i = turnStart(messages);
  const m = messages[i];
  return m?.role === 'user' ? m.content : '';
}

async function foldMemory(
  request: ChatRequest,
  deps: AgentDeps,
): Promise<{ memory: Memory; usage: Usage }> {
  const fold = request.fold ?? [];
  const transcript = fold
    .filter((m) => m.role !== 'tool')
    .map((m) => `${m.role === 'user' ? 'User' : 'Kiki'}: ${m.content}`)
    .join('\n')
    .slice(-12_000);
  const previous = JSON.stringify(request.memory);
  const result = await deps.complete({
    messages: [
      { role: 'system', content: FOLD_PROMPT },
      { role: 'user', content: `Previous memory: ${previous}\n\nConversation:\n${transcript}` },
    ],
    maxTokens: 1024,
    jsonOnly: true,
  });
  const parsed = foldResultSchema.safeParse(parseJsonLoose(result.content));
  // A broken summary never costs the old memory: keep it and drop only what was folded.
  return { memory: parsed.success ? parsed.data : request.memory, usage: result.usage };
}

/** Runs one step of a turn; resolves when the step has ended (with `final`, `tool-call`s or `error`). */
export async function runTurn(
  request: ChatRequest,
  deps: AgentDeps,
  emit: (event: ServerEvent) => void,
): Promise<void> {
  const names = deps.tools ?? undefined;
  const tools = providerTools(names);
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  const budget = deps.turnBudgetMs ?? TURN_BUDGET_MS;
  const startedAt = request.turnStartedAt ?? deps.now();
  let usage = ZERO;

  let memory = request.memory;
  if (request.fold && request.fold.length > 0) {
    emit({ type: 'status', phase: 'thinking' });
    const folded = await foldMemory(request, deps);
    memory = folded.memory;
    usage = addUsage(usage, folded.usage);
    emit({ type: 'memory', memory });
  }

  const userText = lastUserText(request.messages);
  const knowledge = deps.kb.context(userText);
  const system = `${SYSTEM_PROMPT}\n\n${contextBlock({ knowledge: knowledge.text, digest: request.digest, memory })}`;
  const working: WireMessage[] = [...request.messages];
  const produced: WireMessage[] = [];

  emit({ type: 'status', phase: 'thinking' });
  for (;;) {
    const overBudget = deps.now() - startedAt > budget;
    const allowTools = toolRoundsInTurn(working) < MAX_TOOL_ROUNDS && !overBudget;
    // Set inside the stream callback (an object: TS can't see a callback's writes to a local).
    const stream = { streamed: false };
    const result = await deps.complete({
      messages: toProviderMessages(system, working),
      ...(allowTools ? { tools } : {}),
      maxTokens,
      onText: (text) => {
        stream.streamed = true;
        emit({ type: 'text-delta', text });
      },
    });
    usage = addUsage(usage, result.usage);
    const model = result.model;

    const calls = allowTools ? dedupe(result.toolCalls) : [];
    if (calls.length > 0) {
      if (stream.streamed) emit({ type: 'text-reset' });
      const assistant: WireMessage = {
        role: 'assistant',
        content: result.content.slice(0, MAX_ASSISTANT_CHARS),
        toolCalls: calls,
      };
      working.push(assistant);
      produced.push(assistant);
      const client: { call: ToolCall; args: unknown }[] = [];
      let onlyUi = true;
      let question = '';
      for (const call of calls) {
        if (!isToolName(call.name) || (names && !names.includes(call.name))) {
          const message = toolResult(call, { error: `unknown tool ${call.name}` });
          working.push(message);
          produced.push(message);
          onlyUi = false;
          continue;
        }
        const parsed = parseToolArgs(call.name, call.args);
        if (!parsed.ok) {
          const message = toolResult(call, { error: parsed.error });
          working.push(message);
          produced.push(message);
          onlyUi = false;
          continue;
        }
        const kind = toolKind(call.name);
        if (kind === 'server') {
          onlyUi = false;
          const args = parsed.args as { query: string };
          emit({ type: 'server-tool', name: call.name });
          emit({ type: 'status', phase: 'searching' });
          const hits = deps.kb.search(args.query, { k: 3 });
          const message = toolResult(
            call,
            hits.length > 0
              ? hits.map((h) => formatDoc(h.doc)).join('\n\n')
              : 'Nothing found in the knowledge base.',
          );
          working.push(message);
          produced.push(message);
        } else if (kind === 'ui') {
          if (call.name === 'ask_choice') {
            const args = parsed.args as { questionRu: string; options: string[] };
            // Chips are Kiki's words too: an invented number or a vendor in them goes back to the model (M1).
            const issues = shortTextIssues(
              [args.questionRu, ...args.options],
              groundingSources(working, request.digest, { knowledge: knowledge.text, memory }),
            );
            if (issues.length > 0) {
              const message = toolResult(call, {
                error: `not shown: ${issues.map((i) => `${i.code} ${i.detail ?? ''}`).join('; ')}. Ask again without them.`,
              });
              working.push(message);
              produced.push(message);
              onlyUi = false;
              continue;
            }
            question = args.questionRu;
            emit({
              type: 'ui',
              ui: { kind: 'choice', questionRu: args.questionRu, options: args.options },
            });
          } else {
            const args = parsed.args as { target: never; id?: string };
            emit({
              type: 'ui',
              ui: { kind: 'open', target: args.target, ...(args.id ? { id: args.id } : {}) },
            });
          }
          const message = toolResult(call, { shown: true });
          working.push(message);
          produced.push(message);
        } else {
          onlyUi = false;
          const invented = proposalNumbers(call.name, parsed.args).filter(
            (n) =>
              !isGrounded(
                { value: n.value, unit: n.unit as never, raw: n.raw, decimals: 0 },
                groundingPool(
                  groundingSources(working, request.digest, { knowledge: knowledge.text }),
                ),
              ),
          );
          if (invented.length > 0) {
            const message = toolResult(call, {
              error: `amounts not from the user: ${invented.map((n) => n.raw).join(', ')}. Ask the user how much, or propose without an amount.`,
            });
            working.push(message);
            produced.push(message);
            continue;
          }
          client.push({ call, args: parsed.args });
        }
      }
      if (client.length > 0) {
        if (client.some((c) => toolKind(c.call.name as ToolName) === 'propose'))
          emit({ type: 'status', phase: 'planning' });
        emit({ type: 'continue', messages: produced });
        for (const { call, args } of client)
          emit({ type: 'tool-call', callId: call.id, name: call.name, args });
        return;
      }
      if (onlyUi) {
        // A question with chips or a button ends the turn: no second model call for a sentence it already wrote.
        let text = sanitizeMarkdown(result.content) || question;
        if (text) {
          // The words beside the chips pass the same checks as any answer (M1); the checked question replaces them.
          const sources = groundingSources(working, request.digest, {
            knowledge: knowledge.text,
            memory,
          });
          const issues = validateAnswer(text, sources).filter((i) => SHORT_TEXT_CODES.has(i.code));
          const replaced = issues.length > 0;
          if (replaced) text = question || fallbackAnswer(issues);
          const answer: WireMessage = { role: 'assistant', content: text };
          produced.push(answer);
          emit({ type: 'final', text, replaced, messages: produced, model, usage });
          return;
        }
      }
      continue;
    }

    let text = sanitizeMarkdown(result.content);
    const sources = groundingSources(working, request.digest, {
      knowledge: knowledge.text,
      memory,
    });
    const issues = validateAnswer(text, sources);
    let replaced = false;
    if (issues.length > 0) {
      emit({ type: 'status', phase: 'checking' });
      const retry = await deps.complete({
        messages: [
          ...toProviderMessages(system, working),
          { role: 'assistant', content: text || '…' },
          { role: 'user', content: correctionPrompt(issues) },
        ],
        maxTokens,
      });
      usage = addUsage(usage, retry.usage);
      const second = sanitizeMarkdown(retry.content);
      const again = validateAnswer(second, sources);
      text = again.length > 0 ? fallbackAnswer(again) : second;
      replaced = true;
    }
    const answer: WireMessage = { role: 'assistant', content: text };
    produced.push(answer);
    emit({ type: 'final', text, replaced, messages: produced, model, usage });
    return;
  }
}

export { TOOL_RESULT_CHARS as MAX_TOOL_RESULT_CHARS };
