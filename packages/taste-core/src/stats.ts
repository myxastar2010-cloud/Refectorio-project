/** Small numeric helpers for the probit/logistic model (pure functions, unit-tested). */

/** σ(x) = 1 / (1 + e^−x), stable for large |x|. */
export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

export const logit = (p: number): number => Math.log(p / (1 - p));

/** Standard normal density. */
export const normalPdf = (z: number): number => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/**
 * erfc(x) with a Chebyshev fit (Numerical Recipes, «erfcc»): relative error < 1.2·10⁻⁷ everywhere —
 * plenty for posterior updates.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Standard normal CDF Φ(z). */
export const normalCdf = (z: number): number => 0.5 * erfc(-z / Math.SQRT2);

/**
 * N(z) / Φ(z) (inverse Mills ratio), stable for very negative z where Φ underflows: there it tends to −z
 * (asymptotic series up to z⁻⁶).
 */
export function millsRatio(z: number): number {
  if (z < -8) {
    const z2 = 1 / (z * z);
    return -z / (1 - z2 + 3 * z2 * z2 - 15 * z2 * z2 * z2);
  }
  return normalPdf(z) / normalCdf(z);
}

/** Binary entropy in bits. */
export function entropyBits(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/** σ(f) ≈ Φ(λf) with λ² = π/8 (MacKay 1992): lets the logistic model use probit closed forms. */
export const PROBIT_LAMBDA = Math.sqrt(Math.PI / 8);

/** E[σ(f)] for f ~ N(mean, variance) — the probit approximation of the predictive probability. */
export const predictiveProbability = (mean: number, variance: number): number =>
  sigmoid(mean / Math.sqrt(1 + (Math.PI * variance) / 8));

/** √(π ln 2 / 2): h(Φ(x)) ≈ exp(−x² / (π ln 2)) (Houlsby et al. 2011). */
const BALD_C = Math.sqrt((Math.PI * Math.LN2) / 2);

/**
 * BALD — mutual information between the answer and the weights for f ~ N(mean, variance), logistic link
 * (Houlsby, Huszár, Ghahramani & Lengyel 2011, closed form for the probit link; logistic via λ). In bits.
 * High where the model is uncertain about the person's taste (epistemic), low where only the answer is noisy.
 */
export function bald(mean: number, variance: number): number {
  const m = PROBIT_LAMBDA * mean;
  const v = PROBIT_LAMBDA * PROBIT_LAMBDA * variance;
  const marginal = entropyBits(normalCdf(m / Math.sqrt(1 + v)));
  const expected =
    (BALD_C / Math.sqrt(v + BALD_C * BALD_C)) * Math.exp(-(m * m) / (2 * (v + BALD_C * BALD_C)));
  return Math.max(0, marginal - expected);
}
