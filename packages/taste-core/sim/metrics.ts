/** Ranking and calibration metrics for the simulation (pure, unit-tested). */

/** AUC (Mann–Whitney U with average ranks for ties); NaN when one class is missing. */
export function auc(scores: readonly number[], labels: readonly boolean[]): number {
  const order = scores.map((score, index) => ({ score, label: labels[index] === true }));
  order.sort((a, b) => a.score - b.score);
  let rankSumPositive = 0;
  let positives = 0;
  let index = 0;
  while (index < order.length) {
    let end = index;
    while (end + 1 < order.length && order[end + 1]?.score === order[index]?.score) end += 1;
    const averageRank = (index + end) / 2 + 1;
    for (let k = index; k <= end; k += 1) {
      if (order[k]?.label) {
        rankSumPositive += averageRank;
        positives += 1;
      }
    }
    index = end + 1;
  }
  const negatives = order.length - positives;
  if (positives === 0 || negatives === 0) return Number.NaN;
  return (rankSumPositive - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** NDCG@k with binary relevance; NaN when nothing is relevant. */
export function ndcgAt(k: number, scores: readonly number[], labels: readonly boolean[]): number {
  const order = scores
    .map((score, index) => ({ score, label: labels[index] === true, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  let dcg = 0;
  order.slice(0, k).forEach((item, rank) => {
    if (item.label) dcg += 1 / Math.log2(rank + 2);
  });
  const relevant = labels.filter(Boolean).length;
  if (relevant === 0) return Number.NaN;
  let ideal = 0;
  for (let rank = 0; rank < Math.min(k, relevant); rank += 1) ideal += 1 / Math.log2(rank + 2);
  return dcg / ideal;
}

/**
 * Expected Brier score against the player's true answer probabilities:
 * E[(p̂ − y)²] = (p̂ − p)² + p(1 − p).
 */
export function expectedBrier(predicted: readonly number[], truth: readonly number[]): number {
  let sum = 0;
  predicted.forEach((p, index) => {
    const t = truth[index] ?? 0.5;
    sum += (p - t) ** 2 + t * (1 - t);
  });
  return sum / Math.max(1, predicted.length);
}

export type Summary = {
  readonly mean: number;
  readonly low: number;
  readonly high: number;
  readonly n: number;
};

/** Mean with a normal-approximation 95 % confidence interval (NaNs dropped). */
export function summarize(values: readonly number[]): Summary {
  const clean = values.filter((v) => Number.isFinite(v));
  const n = clean.length;
  if (n === 0) return { mean: Number.NaN, low: Number.NaN, high: Number.NaN, n };
  const mean = clean.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? clean.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const half = 1.96 * Math.sqrt(variance / n);
  return { mean, low: mean - half, high: mean + half, n };
}
