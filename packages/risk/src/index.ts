import { ORACLE_STATUS } from "@deepforge/config";
import { baseUnitsToDollars, type OracleInfo } from "@deepforge/config/market";
import type { LogicalPlan } from "@deepforge/compiler";
import type { SimulationReport } from "@deepforge/simulator";

/** Live vault state, in USD (read from the chain / predict-server). */
export interface VaultState {
  valueUsd: number; // balance - total_mtm
  totalMtmUsd: number;
  totalMaxPayoutUsd: number;
  availableWithdrawalUsd: number;
}

export interface RiskScore {
  /** 0..100, higher = healthier/safer. */
  score: number;
  rationale: string;
}

export interface RiskReport {
  /** Composite health 0..100 (higher = safer). */
  overall: number;
  /** On-chain-friendly integer (0..100) recorded in the Strategy object. */
  overallU64: bigint;
  risk: RiskScore; // tail/portfolio risk
  liquidity: RiskScore;
  oracle: RiskScore;
  volatility: RiskScore;
  settlement: RiskScore;
  tail: RiskScore;
  /** Does worst-case loss stay within the user's max-loss policy? */
  maxLossRespected: boolean;
  maxLossPct: number;
  worstCaseLossPct: number;
}

const STALENESS_THRESHOLD_MS = 30_000; // constants.move
const MAX_EXPOSURE_PCT = 0.8; // default_max_total_exposure_pct
const FULL_WINDOW_MS = 60 * 60 * 1000; // a 1h cycle scores full marks on time

function clamp100(x: number): number {
  return Math.max(0, Math.min(100, x));
}

/**
 * Compute a deterministic risk dashboard from the compiled plan, the model
 * simulation, live oracle freshness, and live vault state. Every score is an
 * explicit function of real inputs (no heuristics pulled from thin air).
 *
 * `maxLossPct` is the user's policy from the IR (risk.maxLossPct).
 */
export function assessRisk(args: {
  plan: LogicalPlan;
  sim: SimulationReport;
  oracle: OracleInfo;
  nowMs: number;
  vault?: VaultState;
  maxLossPct: number;
}): RiskReport {
  const { plan, sim, oracle, nowMs, vault, maxLossPct } = args;
  const capital = baseUnitsToDollars(plan.capitalBaseUnits);

  // --- Oracle health: active + fresh ---
  let oracleScore: number;
  let oracleWhy: string;
  if (oracle.status !== ORACLE_STATUS.ACTIVE) {
    oracleScore = 0;
    oracleWhy = `oracle not ACTIVE (status ${oracle.status})`;
  } else {
    const staleMs = Math.max(0, nowMs - oracle.timestampMs);
    const freshness = 1 - staleMs / STALENESS_THRESHOLD_MS;
    oracleScore = clamp100(freshness * 100);
    oracleWhy = `last update ${Math.round(staleMs / 1000)}s ago (stale at ${
      STALENESS_THRESHOLD_MS / 1000
    }s)`;
  }

  // --- Liquidity: vault utilization vs the exposure cap + withdrawal room ---
  let liqScore: number;
  let liqWhy: string;
  if (!vault || vault.valueUsd <= 0) {
    liqScore = 50;
    liqWhy = "vault state unavailable; neutral score";
  } else {
    const utilization = vault.totalMtmUsd / vault.valueUsd; // 0..~0.8 cap
    const headroom = 1 - utilization / MAX_EXPOSURE_PCT;
    const coverage = vault.valueUsd >= vault.totalMaxPayoutUsd ? 1 : vault.valueUsd / vault.totalMaxPayoutUsd;
    liqScore = clamp100(Math.min(headroom, coverage) * 100);
    liqWhy = `utilization ${(utilization * 100).toFixed(0)}% of ${(
      MAX_EXPOSURE_PCT * 100
    ).toFixed(0)}% cap; payout coverage ${(coverage * 100).toFixed(0)}%`;
  }

  // --- Settlement: more time-to-expiry = more room to manage the position ---
  const ttl = Math.max(0, plan.expiryMs - nowMs);
  const settleScore = clamp100((ttl / FULL_WINDOW_MS) * 100);
  const settleWhy = `${Math.round(ttl / 60000)}m to expiry`;

  // --- Volatility exposure: unhedged directional fraction of capital ---
  const directionalUsd = plan.legs
    .filter((l) => l.kind === "binary" && !/HEDGE/.test(l.label))
    .reduce((s, l) => s + baseUnitsToDollars(l.budgetBaseUnits), 0);
  const hedgeUsd = plan.legs
    .filter((l) => /HEDGE/.test(l.label))
    .reduce((s, l) => s + baseUnitsToDollars(l.budgetBaseUnits), 0);
  const netDirectional = Math.max(0, directionalUsd - hedgeUsd);
  const directionalFrac = capital > 0 ? netDirectional / capital : 0;
  const volScore = clamp100((1 - directionalFrac) * 100);
  const volWhy = `${(directionalFrac * 100).toFixed(0)}% of capital in unhedged directional bets`;

  // --- Tail risk: worst-case loss from the simulation ---
  const tailScore = clamp100((1 - sim.capitalAtRisk) * 100);
  const tailWhy = `worst-case loss ${(sim.capitalAtRisk * 100).toFixed(0)}% of capital`;

  // --- Overall portfolio risk: probability of profit + tail blended ---
  const riskScore = clamp100((sim.probProfit * 0.5 + (1 - sim.capitalAtRisk) * 0.5) * 100);
  const riskWhy = `P(profit) ${(sim.probProfit * 100).toFixed(0)}%, tail ${(
    sim.capitalAtRisk * 100
  ).toFixed(0)}%`;

  const worstCaseLossPct = sim.capitalAtRisk * 100;
  const maxLossRespected = worstCaseLossPct <= maxLossPct + 1e-9;

  // Composite weights chosen to emphasize tail + liquidity safety.
  const overall = clamp100(
    0.3 * tailScore +
      0.2 * liqScore +
      0.2 * riskScore +
      0.15 * oracleScore +
      0.1 * volScore +
      0.05 * settleScore,
  );

  return {
    overall,
    overallU64: BigInt(Math.round(overall)),
    risk: { score: riskScore, rationale: riskWhy },
    liquidity: { score: liqScore, rationale: liqWhy },
    oracle: { score: oracleScore, rationale: oracleWhy },
    volatility: { score: volScore, rationale: volWhy },
    settlement: { score: settleScore, rationale: settleWhy },
    tail: { score: tailScore, rationale: tailWhy },
    maxLossRespected,
    maxLossPct,
    worstCaseLossPct,
  };
}
