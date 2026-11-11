/**
 * The provider chain (ТЗ 07 §2): models in the order of `AI_PROVIDERS`; 429 / 5xx / timeout / an empty answer → the
 * next model, unless visible text already went out (then the step fails and the client offers a retry). A model that
 * answered 429 rests for a while. Metrics only — never message contents.
 */
import type { Complete, ProviderRequest } from '@refectorio/kiki-core';
import { ProviderError, streamChat, type ModelSpec } from './provider';

export type ChainOptions = {
  readonly models: readonly ModelSpec[];
  readonly key: () => string | null;
  readonly fetchImpl?: typeof fetch;
  readonly firstByteTimeoutMs?: number;
  readonly stallTimeoutMs?: number;
  readonly cooldownMs?: number;
  readonly now?: () => number;
  readonly log?: (entry: Record<string, unknown>) => void;
};

export class ChainUnavailable extends Error {
  constructor(
    readonly retryAfterMs: number,
    /** Some text was already shown when the model failed. */
    readonly streamed: boolean,
  ) {
    super('all models unavailable');
  }
}

export type ProviderStatus = {
  readonly lastOkAt: number | null;
  readonly lastErrorAt: number | null;
  readonly lastErrorCode: string | null;
};

export type Chain = {
  readonly complete: (request: ProviderRequest, signal?: AbortSignal) => ReturnType<Complete>;
  readonly status: () => ProviderStatus;
  readonly models: readonly ModelSpec[];
};

export const FIRST_BYTE_TIMEOUT_MS = 20_000;
export const STALL_TIMEOUT_MS = 20_000;
export const COOLDOWN_MS = 60_000;

export function createChain(options: ChainOptions): Chain {
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => {});
  const resting = new Map<string, number>();
  let status: ProviderStatus = { lastOkAt: null, lastErrorAt: null, lastErrorCode: null };

  const complete: Chain['complete'] = async (request, signal) => {
    const key = options.key();
    if (!key) throw new ChainUnavailable(60_000, false);
    const t = now();
    const ready = options.models.filter((m) => (resting.get(m.id) ?? 0) <= t);
    // Every model resting: try them anyway rather than fail outright.
    const order = ready.length > 0 ? ready : options.models;
    for (const model of order) {
      const started = now();
      try {
        const result = await streamChat({
          model,
          key,
          request,
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          firstByteTimeoutMs: options.firstByteTimeoutMs ?? FIRST_BYTE_TIMEOUT_MS,
          stallTimeoutMs: options.stallTimeoutMs ?? STALL_TIMEOUT_MS,
          ...(signal ? { signal } : {}),
        });
        status = { ...status, lastOkAt: now() };
        log({
          event: 'step',
          model: model.id,
          ms: now() - started,
          tools: result.toolCalls.map((c) => c.name),
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          cachedTokens: result.usage.cachedTokens,
        });
        return result;
      } catch (error) {
        const e =
          error instanceof ProviderError ? error : new ProviderError('network', null, false, 'x');
        status = {
          ...status,
          lastErrorAt: now(),
          lastErrorCode: e.status ? `${e.code}:${e.status}` : e.code,
        };
        log({
          event: 'step-error',
          model: model.id,
          ms: now() - started,
          code: e.code,
          status: e.status,
        });
        if (e.code === 'aborted') throw e;
        if (e.status === 429) resting.set(model.id, now() + (options.cooldownMs ?? COOLDOWN_MS));
        if (e.streamed) throw new ChainUnavailable(0, true);
      }
    }
    throw new ChainUnavailable(30_000, false);
  };

  return { complete, status: () => status, models: options.models };
}
