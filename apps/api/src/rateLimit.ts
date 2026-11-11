/**
 * Limits (ТЗ 07 §2): per IP — chat 20 turns / 10 min and 150 / day, every POST of a turn (its tool steps too) 120 /
 * 10 min and 600 / day, vision 10 / day, search 30 / day; for the whole server — 300 model steps / 10 min, so a
 * spoofed address or a script can never burn the free provider quota (review of phase 5, M4). Fixed windows in
 * memory — one free instance, a restart forgets them (acceptable for a demo; ADR 0013). The map of counters is capped.
 */
export type Window = { readonly limit: number; readonly ms: number };

const MIN = 60_000;
const DAY = 24 * 3_600_000;

export const LIMITS = {
  chat: [
    { limit: 20, ms: 10 * MIN },
    { limit: 150, ms: DAY },
  ],
  step: [
    { limit: 120, ms: 10 * MIN },
    { limit: 600, ms: DAY },
  ],
  vision: [{ limit: 10, ms: DAY }],
  search: [{ limit: 30, ms: DAY }],
  /** Keyed by {@link GLOBAL_KEY}, never by an address. */
  global: [{ limit: 300, ms: 10 * MIN }],
} as const satisfies Record<string, readonly Window[]>;
export type Bucket = keyof typeof LIMITS;
export type Limits = Readonly<Partial<Record<Bucket, readonly Window[]>>>;
export const GLOBAL_KEY = '*';
/** Counters kept at most (≈ 100 bytes each): beyond this the oldest go first. */
export const MAX_COUNTERS = 50_000;

type Counter = { start: number; count: number; ms: number };

export type Limiter = {
  /**
   * Counts one use in every listed bucket, or none: returns 0 when all allow it, otherwise the ms until they all
   * would (nothing counted).
   */
  take(...uses: readonly (readonly [Bucket, string])[]): number;
  /** Drops expired counters (called now and then). */
  sweep(): void;
  readonly size: () => number;
};

/**
 * Multiplies the per-address limits (not the server-wide one) — for a demo where a whole class shares one school
 * address: `KIKI_LIMIT_SCALE=3` on Render.
 */
export function scaleLimits(limits: Limits, factor: number): Limits {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return limits;
  const out: Partial<Record<Bucket, readonly Window[]>> = {};
  for (const [bucket, windows] of Object.entries(limits) as [Bucket, readonly Window[]][])
    out[bucket] =
      bucket === 'global'
        ? windows
        : windows.map((w) => ({ ...w, limit: Math.max(1, Math.round(w.limit * factor)) }));
  return out;
}

export function createLimiter(
  now: () => number = Date.now,
  limits: Limits = LIMITS,
  maxCounters = MAX_COUNTERS,
): Limiter {
  const counters = new Map<string, Counter>();
  const keyOf = (bucket: string, i: number, ip: string) => `${bucket}:${String(i)}:${ip}`;
  const sweep = () => {
    const t = now();
    for (const [key, c] of counters) if (t - c.start >= c.ms) counters.delete(key);
  };
  const makeRoom = () => {
    if (counters.size < maxCounters) return;
    sweep();
    // Still full: the oldest inserted go first (a Map keeps insertion order).
    for (const key of counters.keys()) {
      if (counters.size < maxCounters) break;
      counters.delete(key);
    }
  };
  return {
    take(...uses) {
      const t = now();
      let wait = 0;
      for (const [bucket, ip] of uses)
        (limits[bucket] ?? []).forEach((w, i) => {
          const c = counters.get(keyOf(bucket, i, ip));
          if (c && t - c.start < w.ms && c.count >= w.limit)
            wait = Math.max(wait, c.start + w.ms - t);
        });
      if (wait > 0) return wait;
      for (const [bucket, ip] of uses)
        (limits[bucket] ?? []).forEach((w, i) => {
          const key = keyOf(bucket, i, ip);
          const c = counters.get(key);
          if (c && t - c.start < w.ms) c.count++;
          else {
            if (!c) makeRoom();
            counters.set(key, { start: t, count: 1, ms: w.ms });
          }
        });
      return 0;
    },
    sweep,
    size: () => counters.size,
  };
}
