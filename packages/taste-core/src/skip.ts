import { logit, millsRatio, PROBIT_LAMBDA, predictiveProbability } from './stats';

/**
 * Skips are modelled apart from taste: a skip says «I don't know this dish» or «not sure», not «I dislike it», so it
 * never moves the taste weights. P(skip) = σ(a + b·(1 − familiarity) − τ), where τ is the person's novelty tolerance
 * (a 1-D Gaussian belief, updated by every card: a skip lowers it). Selection multiplies the information of a card by
 * P(decisive) = 1 − P(skip), so skip-prone players see more familiar dishes. Food neophobia: research/R15 §6.
 */
export const SKIP_MODEL = {
  /** P(skip) of a perfectly familiar dish for an average person. */
  baseRate: 0.06,
  /** Logit added by total unfamiliarity (familiarity 0): ≈ 40 % skips for an unknown dish. */
  unfamiliarityLogit: 2.3,
  toleranceSd: 1,
} as const;

export type SkipBelief = { readonly mean: number; readonly variance: number };

export const PRIOR_SKIP_BELIEF: SkipBelief = {
  mean: 0,
  variance: SKIP_MODEL.toleranceSd ** 2,
};

const offset = (familiarity: number) =>
  logit(SKIP_MODEL.baseRate) + SKIP_MODEL.unfamiliarityLogit * (1 - familiarity);

export function skipProbability(belief: SkipBelief, familiarity: number): number {
  // f = offset − τ: mean offset − mean(τ), variance var(τ).
  return predictiveProbability(offset(familiarity) - belief.mean, belief.variance);
}

/** Moment-matched update of τ after a card: skipped (y = +1 on f) or answered (y = −1). */
export function updateSkipBelief(
  belief: SkipBelief,
  familiarity: number,
  skipped: boolean,
): SkipBelief {
  const y = skipped ? 1 : -1;
  // f = c − τ ⇒ in terms of τ the coefficient is −1: mean_f = c − μ, var_f = σ².
  const m = PROBIT_LAMBDA * (offset(familiarity) - belief.mean);
  const v = PROBIT_LAMBDA * PROBIT_LAMBDA * belief.variance;
  const root = Math.sqrt(1 + v);
  const alpha = (y * millsRatio((y * m) / root)) / root;
  const gamma = alpha * alpha + (alpha * m) / (1 + v);
  // ∂f/∂τ = −1: the mean moves against the f-gradient, the variance shrinks the same way.
  return {
    mean: belief.mean - PROBIT_LAMBDA * alpha * belief.variance,
    variance: belief.variance * (1 - PROBIT_LAMBDA * PROBIT_LAMBDA * gamma * belief.variance),
  };
}
