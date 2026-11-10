/**
 * Chat messages on the wire (ТЗ 07 §2, §5): the browser keeps the chat, the server is stateless — every request carries
 * the window. The shape follows OpenAI-compatible chat messages, so the server maps it 1:1 to the provider.
 */
import { z } from 'zod';

export const MAX_USER_CHARS = 4000;
export const MAX_ASSISTANT_CHARS = 8000;
export const MAX_TOOL_CHARS = 16_000;
export const MAX_TOOL_CALLS_PER_ROUND = 8;

export const toolCallSchema = z.object({
  /** The provider's call id (any format: ids differ per model, R20 §6.3) — never parsed. */
  id: z.string().min(1).max(80),
  name: z.string().regex(/^[a-z_]{2,40}$/),
  /** Arguments as the model wrote them (a JSON text). */
  args: z.string().max(8000),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

export const wireMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string().max(MAX_USER_CHARS) }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().max(MAX_ASSISTANT_CHARS),
    toolCalls: z.array(toolCallSchema).max(MAX_TOOL_CALLS_PER_ROUND).optional(),
  }),
  z.object({
    role: z.literal('tool'),
    callId: z.string().min(1).max(80),
    name: z.string().regex(/^[a-z_]{2,40}$/),
    content: z.string().max(MAX_TOOL_CHARS),
  }),
]);
export type WireMessage = z.infer<typeof wireMessageSchema>;
export type UserMessage = Extract<WireMessage, { role: 'user' }>;
export type AssistantMessage = Extract<WireMessage, { role: 'assistant' }>;
export type ToolMessage = Extract<WireMessage, { role: 'tool' }>;

/**
 * A rough token count for budgets (no tokenizer in the browser): Russian text in modern BPE vocabularies is about
 * 3 characters per token, JSON a little denser — a conservative estimate keeps the context under its budget.
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

export function messageTokens(message: WireMessage): number {
  const calls =
    message.role === 'assistant'
      ? (message.toolCalls ?? []).reduce((sum, c) => sum + estimateTokens(c.args) + 8, 0)
      : 0;
  return estimateTokens(message.content) + calls + 4;
}

/** Index of the last user message (the start of the current turn), −1 if none. */
export function turnStart(messages: readonly WireMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'user') return i;
  return -1;
}

/** Assistant messages with tool calls since the last user message: tool rounds already spent in this turn. */
export function toolRoundsInTurn(messages: readonly WireMessage[]): number {
  const start = turnStart(messages);
  let rounds = 0;
  for (let i = start + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m?.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0) rounds++;
  }
  return rounds;
}

/**
 * Every tool call has its result and every result its call (providers reject orphans). Returns the first problem or
 * null; the server refuses a malformed window instead of letting the provider fail on it.
 */
export function pairingProblem(messages: readonly WireMessage[]): string | null {
  const open = new Map<string, string>();
  for (const m of messages) {
    if (m.role === 'assistant') {
      if (open.size > 0) return `unanswered tool call ${[...open.keys()].join(',')}`;
      for (const call of m.toolCalls ?? []) open.set(call.id, call.name);
    } else if (m.role === 'tool') {
      if (open.get(m.callId) !== m.name) return `tool result without its call: ${m.callId}`;
      open.delete(m.callId);
    } else if (open.size > 0) return `unanswered tool call ${[...open.keys()].join(',')}`;
  }
  return null;
}
