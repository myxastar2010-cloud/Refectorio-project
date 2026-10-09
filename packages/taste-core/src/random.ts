/** Deterministic randomness: the same seed and answers give the same card sequence (?seed, replay, tests). */

export type Random = {
  /** Uniform in [0, 1). */
  next: () => number;
  /** Uniform integer in [0, n). */
  int: (n: number) => number;
  /** Standard normal (Box–Muller). */
  normal: () => number;
};

/** mulberry32 — tiny, fast, good enough for jitter and simulations. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    normal: () => {
      const u = Math.max(next(), Number.EPSILON);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
  };
}

/** FNV-1a over a string, mixed with a seed: a stateless uniform number for (seed, step, dish) jitter. */
export function hashUnit(seed: number, ...parts: readonly (string | number)[]): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash = Math.imul(hash ^ 0x2f, 0x01000193) >>> 0;
  }
  // Final avalanche (murmur3 fmix32).
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}
