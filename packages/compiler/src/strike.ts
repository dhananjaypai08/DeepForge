import type { OracleInfo } from "@deepforge/config/market";
import type { StrikeSelector, RangeBounds } from "@deepforge/ir";

/** Round a USD value to the nearest multiple of the oracle's strike tick. */
export function roundToTick(usd: number, tickSize: number): number {
  if (tickSize <= 0) return usd;
  return Math.round(usd / tickSize) * tickSize;
}

/** ATM total implied variance w(0) from the SVI params (k = 0). */
export function atmTotalVariance(o: OracleInfo): number {
  const { a, b, rho, m, sigma } = o.svi;
  const k = 0;
  return a + b * (rho * (k - m) + Math.sqrt((k - m) * (k - m) + sigma * sigma));
}

/** One-standard-deviation log-return to expiry implied by the ATM SVI vol. */
export function atmSigmaMove(o: OracleInfo): number {
  return Math.sqrt(Math.max(0, atmTotalVariance(o)));
}

/**
 * Resolve a StrikeSelector to a concrete, tick-aligned USD strike using the
 * oracle's live forward and SVI surface. Pure and deterministic given `o`.
 */
export function resolveStrike(sel: StrikeSelector, o: OracleInfo): number {
  let raw: number;
  if (sel.price !== undefined) {
    raw = sel.price;
  } else if (sel.atmOffsetBps !== undefined) {
    raw = o.forward * (1 + sel.atmOffsetBps / 10_000);
  } else {
    // atmSigma: move N implied standard deviations from the forward.
    const oneSd = atmSigmaMove(o);
    raw = o.forward * Math.exp((sel.atmSigma ?? 0) * oneSd);
  }
  return roundToTick(raw, o.tickSize);
}

/** Resolve range bounds to tick-aligned USD prices. */
export function resolveRange(
  b: RangeBounds,
  o: OracleInfo,
): { lower: number; upper: number } {
  let lower: number;
  let upper: number;
  if (b.lowerPrice !== undefined && b.upperPrice !== undefined) {
    lower = b.lowerPrice;
    upper = b.upperPrice;
  } else {
    const w = (b.widthBps ?? 0) / 10_000;
    lower = o.forward * (1 - w);
    upper = o.forward * (1 + w);
  }
  lower = roundToTick(lower, o.tickSize);
  upper = roundToTick(upper, o.tickSize);
  // Guarantee a non-degenerate range after rounding.
  if (upper <= lower) upper = lower + o.tickSize;
  return { lower, upper };
}
