import type { OracleInfo, SVI } from "@deepforge/config/market";

/**
 * Faithful port of the DeepBook Predict pricing model
 * (packages/predict/sources/helper/math.move + oracle pricing):
 *
 *   k    = ln(strike / forward)                          (log-moneyness)
 *   w(k) = a + b*( rho*(k-m) + sqrt((k-m)^2 + sigma^2) ) (SVI total variance)
 *   d2   = (-k - w/2) / sqrt(w)
 *   UP   = Phi(d2)      (risk-neutral prob. spot > strike at expiry)
 *   DOWN = 1 - UP
 *
 * On-chain, Phi is Cody's rational Chebyshev approximation. Here we use the
 * Abramowitz & Stegun 7.1.26 erf approximation (max abs error ~1.5e-7), which
 * is accurate enough for a *model* distribution; the authoritative trade cost
 * always comes from `get_trade_amounts` via devInspect, not this function.
 */

/** Standard normal CDF Phi(x). */
export function normalCdf(x: number): number {
  // erf via A&S 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-(x / Math.SQRT2) * (x / Math.SQRT2));
  const erf = x >= 0 ? y : -y;
  return 0.5 * (1 + erf);
}

/** SVI total implied variance at log-moneyness k. */
export function sviTotalVariance(svi: SVI, k: number): number {
  const { a, b, rho, m, sigma } = svi;
  const d = k - m;
  return a + b * (rho * d + Math.sqrt(d * d + sigma * sigma));
}

/** Risk-neutral probability that spot finishes strictly above `strikeUsd`. */
export function binaryUpPrice(o: OracleInfo, strikeUsd: number): number {
  if (strikeUsd <= 0) return 1;
  const k = Math.log(strikeUsd / o.forward);
  const w = sviTotalVariance(o.svi, k);
  if (w <= 0) return o.forward > strikeUsd ? 1 : 0; // degenerate / expired vol
  const d2 = (-k - w / 2) / Math.sqrt(w);
  return clamp01(normalCdf(d2));
}

export function binaryDownPrice(o: OracleInfo, strikeUsd: number): number {
  return clamp01(1 - binaryUpPrice(o, strikeUsd));
}

/** Probability spot finishes in (lowerUsd, upperUsd]. */
export function rangePrice(o: OracleInfo, lowerUsd: number, upperUsd: number): number {
  return clamp01(binaryUpPrice(o, lowerUsd) - binaryUpPrice(o, upperUsd));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Mirror the protocol's ask construction for an *estimate* when no devInspect
 * preview is available: cost ≈ (fair + base spread), clamped to [minAsk,maxAsk].
 * Defaults match constants.move (base 2%, min 0.5%, ask floor 1% / cap 99%).
 */
export function estimateAskPrice(
  fair: number,
  opts: { baseSpread?: number; minAsk?: number; maxAsk?: number } = {},
): number {
  const baseSpread = opts.baseSpread ?? 0.02;
  const minAsk = opts.minAsk ?? 0.01;
  const maxAsk = opts.maxAsk ?? 0.99;
  const spread = Math.max(0.005, baseSpread * Math.sqrt(fair * (1 - fair)));
  return Math.min(maxAsk, Math.max(minAsk, fair + spread));
}
