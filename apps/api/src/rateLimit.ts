/**
 * Limits (ТЗ 07 §2; stage 5, phase 0 — the security audit's two P0s, D-128). Per IP: chat 20 turns / 10 min and 150 /
 * day; every POST of a turn (its tool steps too) 120 / 10 min and 600 / day; every model call (each provider attempt,
 * a fallback model too) 30 / 10 min and 150 / day; vision 10 / day; search 30 / day. For the whole server, model calls
 * per minute and per day kept below the provider's allowance (APInex free: 15 / min per account): the public share,
 * and a reserve only demo passes can spend — a script with a forged Origin can empty the public share, never the
 * demo's. Fixed windows in memory — one free instance, a restart forgets them (acceptable for a demo; ADR 0013). The
 * map of counters is capped.
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
  call: [
    { limit: 30, ms: 10 * MIN },
    { limit: 150, ms: DAY },
  ],
  vision: [{ limit: 10, ms: DAY }],
  search: [{ limit: 30, ms: DAY }],
  /** Model calls of everyone without a demo pass. Keyed by {@link GLOBAL_KEY}, never by an address. */
  public: [
    { limit: 8, ms: MIN },
    { limit: 1500, ms: DAY },
  ],
  /** Model calls only demo passes spend (then the public share). Keyed by {@link GLOBAL_KEY}. */
  reserve: [
    { limit: 4, ms: MIN },
    { limit: 600, ms: DAY },
  ],
} as const satisfies Record<string, readonly Window[]>;
export type Bucket = keyof typeof LIMITS;
export type Limits = Readonly<Partial<Record<Bucket, readonly Window[]>>>;
export const GLOBAL_KEY = '*';
/** Counters kept at most (≈ 100 bytes each): beyond this the oldest go first. */
export const MAX_COUNTERS = 50_000;
/** Buckets of the whole server: a per-address scale never touches them. */
const SERVER_WIDE: ReadonlySet<Bucket> = new Set(['public', 'reserve']);

type Counter = { start: number; count: number; ms: number };
type Use = readonly [Bucket, string];

export type Limiter = {
  /**
   * Counts one use in every listed bucket, or none: returns 0 when all allow it, otherwise the ms until they all
   * would (nothing counted).
   */
  take(...uses: readonly Use[]): number;
  /** The ms until every listed bucket would allow one more use; 0 — allowed now. Counts nothing. */
  check(...uses: readonly Use[]): number;
  /** Drops expired counters (called now and then). */
  sweep(): void;
  readonly size: () => number;
};

/**
 * Multiplies the per-address limits (never the server-wide shares) — for a class that shares one school address:
 * `KIKI_LIMIT_SCALE` on Render. On a demo day give the jury demo passes instead: a pass skips the address limits.
 */
export function scaleLimits(limits: Limits, factor: number): Limits {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return limits;
  const out: Partial<Record<Bucket, readonly Window[]>> = {};
  for (const [bucket, windows] of Object.entries(limits) as [Bucket, readonly Window[]][])
    out[bucket] = SERVER_WIDE.has(bucket)
      ? windows
      : windows.map((w) => ({ ...w, limit: Math.max(1, Math.round(w.limit * factor)) }));
  return out;
}

/**
 * The server-wide shares per minute from the environment (`KIKI_PUBLIC_PER_MIN`, `KIKI_RESERVE_PER_MIN`): their sum
 * stays below the provider's own per-minute allowance. Missing or invalid values keep the defaults; 0 closes a share.
 */
export function withShares(
  limits: Limits,
  shares: {
    readonly publicPerMin?: number | undefined;
    readonly reservePerMin?: number | undefined;
  },
): Limits {
  const perMin = (windows: readonly Window[] | undefined, value: number | undefined) =>
    windows && value !== undefined && Number.isInteger(value) && value >= 0
      ? windows.map((w) => (w.ms === MIN ? { ...w, limit: value } : w))
      : windows;
  const pub = perMin(limits.public, shares.publicPerMin);
  const reserve = perMin(limits.reserve, shares.reservePerMin);
  return { ...limits, ...(pub ? { public: pub } : {}), ...(reserve ? { reserve } : {}) };
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
  const waitFor = (t: number, uses: readonly Use[]) => {
    let wait = 0;
    for (const [bucket, ip] of uses)
      (limits[bucket] ?? []).forEach((w, i) => {
        // A closed share (limit 0) waits a whole window.
        if (w.limit <= 0) {
          wait = Math.max(wait, w.ms);
          return;
        }
        const c = counters.get(keyOf(bucket, i, ip));
        if (c && t - c.start < w.ms && c.count >= w.limit)
          wait = Math.max(wait, c.start + w.ms - t);
      });
    return wait;
  };
  return {
    check: (...uses) => waitFor(now(), uses),
    take(...uses) {
      const t = now();
      const wait = waitFor(t, uses);
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
