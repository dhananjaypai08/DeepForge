import { FLOAT_SCALING, FLOAT_SCALING_NUM, QUOTE_UNIT, type OracleStatus } from "./index.js";

/**
 * SVI (Stochastic-Volatility-Inspired) parameters in human float units
 * (already divided out of FLOAT_SCALING). Total implied variance for
 * log-moneyness k is:  w(k) = a + b * ( rho*(k-m) + sqrt((k-m)^2 + sigma^2) ).
 */
export interface SVI {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

/** A live oracle snapshot, in human units (USD prices, ms times). */
export interface OracleInfo {
  id: string;
  underlying: string; // e.g. "BTC"
  expiryMs: number;
  status: OracleStatus;
  spot: number; // USD
  forward: number; // USD
  svi: SVI;
  /** Strike-grid spacing in USD (strikes must be multiples of this). */
  tickSize: number;
  minStrike?: number;
  settlementPrice?: number; // USD, present once settled
  timestampMs: number;
}

export interface MarketContext {
  nowMs: number;
  oracles: OracleInfo[];
}

// --- Scaling helpers -------------------------------------------------------
// Predict encodes prices, percentages and SVI params as u64 scaled by
// FLOAT_SCALING (1e9). Quote/PLP amounts are base units with 6 decimals.

/** USD price -> on-chain scaled u64 (bigint). */
export function priceToScaled(usd: number): bigint {
  return BigInt(Math.round(usd * FLOAT_SCALING_NUM));
}

/** On-chain scaled u64 price -> USD float. */
export function scaledToPrice(scaled: bigint): number {
  return Number(scaled) / FLOAT_SCALING_NUM;
}

/** USD dollars (float) -> quote base units (bigint, 6 dp). */
export function dollarsToBaseUnits(usd: number): bigint {
  return BigInt(Math.round(usd * Number(QUOTE_UNIT)));
}

/** Quote base units -> USD dollars (float). */
export function baseUnitsToDollars(base: bigint): number {
  return Number(base) / Number(QUOTE_UNIT);
}

/** Probability/percentage float (0..1) -> scaled u64. */
export function fractionToScaled(frac: number): bigint {
  return BigInt(Math.round(frac * FLOAT_SCALING_NUM));
}

export function scaledToFraction(scaled: bigint): number {
  return Number(scaled) / FLOAT_SCALING_NUM;
}

export { FLOAT_SCALING };
