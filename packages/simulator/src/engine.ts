import { baseUnitsToDollars, type OracleInfo } from "@deepforge/config/market";
import type { LogicalPlan, ResolvedLeg } from "@deepforge/compiler";
import {
  binaryDownPrice,
  binaryUpPrice,
  estimateAskPrice,
  rangePrice,
  sviTotalVariance,
} from "./pricing.js";

export interface LegSim {
  label: string;
  kind: ResolvedLeg["kind"];
  /** Model-fair probability of winning (0..1); undefined for PLP. */
  fairPrice?: number;
  /** Cost per $1 of payoff face (the ask). undefined for PLP. */
  unitCost?: number;
  costUsd: number;
  /** Dollars of payout received if this leg wins. undefined for PLP. */
  payoffIfWinUsd?: number;
}

export interface HistogramBin {
  centerUsd: number;
  prob: number;
  pnlUsd: number;
}

export interface SimulationReport {
  oracleId: string;
  expiryMs: number;
  totalCostUsd: number;
  bestUsd: number;
  expectedUsd: number;
  worstUsd: number;
  probProfit: number;
  /** Worst-case loss as a fraction of deployed capital (0..1). */
  capitalAtRisk: number;
  legs: LegSim[];
  histogram: HistogramBin[];
  explanation: string;
}

/** Per-leg cost override (e.g. exact ask from a devInspect preview). */
export type CostOverrides = Record<number, number>; // leg index -> unitCost

const GRID_BINS = 121;
const GRID_SD = 6;

/**
 * Simulate a compiled plan against a live oracle. The terminal price
 * distribution is the model's own risk-neutral law, read directly from the
 * binary price function (P[S_T <= K] = 1 - binaryUpPrice(K)), so payoff and
 * pricing are mutually consistent. Pass `overrides` with devInspect-derived
 * unit costs to make the cost numbers exact.
 *
 * PLP legs are treated as principal-preserving (0 directional PnL) — they earn
 * protocol fees that are not modeled per-scenario; this is stated in the report.
 */
export function simulate(
  plan: LogicalPlan,
  oracle: OracleInfo,
  overrides: CostOverrides = {},
): SimulationReport {
  const legs: (LegSim & { leg: ResolvedLeg })[] = plan.legs.map((leg, i) => {
    const costUsd = baseUnitsToDollars(leg.budgetBaseUnits);
    if (leg.kind === "plp") {
      return { leg, label: leg.label, kind: leg.kind, costUsd };
    }
    let fair: number;
    if (leg.kind === "binary") {
      fair =
        leg.direction === 0
          ? binaryUpPrice(oracle, leg.strikeUsd)
          : binaryDownPrice(oracle, leg.strikeUsd);
    } else {
      fair = rangePrice(oracle, leg.lowerUsd, leg.upperUsd);
    }
    const unitCost = overrides[i] ?? estimateAskPrice(fair);
    const payoffIfWinUsd = unitCost > 0 ? costUsd / unitCost : 0;
    return {
      leg,
      label: leg.label,
      kind: leg.kind,
      fairPrice: fair,
      unitCost,
      costUsd,
      payoffIfWinUsd,
    };
  });

  const totalCostUsd = legs.reduce((s, l) => s + l.costUsd, 0);

  // Terminal price grid using ATM total variance.
  const wAtm = Math.max(1e-9, sviTotalVariance(oracle.svi, 0));
  const sd = Math.sqrt(wAtm);
  const edges: number[] = [];
  for (let i = 0; i <= GRID_BINS; i++) {
    const z = -GRID_SD + (2 * GRID_SD * i) / GRID_BINS;
    edges.push(oracle.forward * Math.exp(z * sd));
  }

  const histogram: HistogramBin[] = [];
  let probSum = 0;
  for (let i = 0; i < GRID_BINS; i++) {
    const lo = edges[i]!;
    const hi = edges[i + 1]!;
    const center = Math.sqrt(lo * hi);
    // P[S in (lo, hi]] = upPrice(lo) - upPrice(hi)
    const prob = Math.max(0, binaryUpPrice(oracle, lo) - binaryUpPrice(oracle, hi));
    const pnlUsd = portfolioPnl(legs, center);
    histogram.push({ centerUsd: center, prob, pnlUsd });
    probSum += prob;
  }
  // Normalize for tail mass outside the grid.
  if (probSum > 0) for (const b of histogram) b.prob /= probSum;

  let expectedUsd = 0;
  let probProfit = 0;
  let bestUsd = -Infinity;
  let worstUsd = Infinity;
  for (const b of histogram) {
    expectedUsd += b.prob * b.pnlUsd;
    if (b.pnlUsd > 0) probProfit += b.prob;
    if (b.pnlUsd > bestUsd) bestUsd = b.pnlUsd;
    if (b.pnlUsd < worstUsd) worstUsd = b.pnlUsd;
  }

  const capital = baseUnitsToDollars(plan.capitalBaseUnits);
  const capitalAtRisk = capital > 0 ? Math.min(1, Math.max(0, -worstUsd) / capital) : 0;

  return {
    oracleId: plan.oracleId,
    expiryMs: plan.expiryMs,
    totalCostUsd,
    bestUsd,
    expectedUsd,
    worstUsd,
    probProfit,
    capitalAtRisk,
    legs: legs.map(({ leg: _leg, ...rest }) => rest),
    histogram,
    explanation: explain(plan, legs, {
      expectedUsd,
      bestUsd,
      worstUsd,
      probProfit,
      capitalAtRisk,
    }),
  };
}

function portfolioPnl(
  legs: { leg: ResolvedLeg; costUsd: number; payoffIfWinUsd?: number }[],
  terminal: number,
): number {
  let pnl = 0;
  for (const l of legs) {
    const leg = l.leg;
    if (leg.kind === "plp") continue; // principal-preserving, 0 directional PnL
    const face = l.payoffIfWinUsd ?? 0;
    let won = false;
    if (leg.kind === "binary") {
      won = leg.direction === 0 ? terminal > leg.strikeUsd : terminal <= leg.strikeUsd;
    } else {
      won = terminal > leg.lowerUsd && terminal <= leg.upperUsd;
    }
    pnl += (won ? face : 0) - l.costUsd;
  }
  return pnl;
}

function explain(
  plan: LogicalPlan,
  legs: LegSim[],
  agg: {
    expectedUsd: number;
    bestUsd: number;
    worstUsd: number;
    probProfit: number;
    capitalAtRisk: number;
  },
): string {
  const parts: string[] = [];
  for (const l of legs) {
    if (l.kind === "plp") {
      parts.push(
        `supplies $${l.costUsd.toFixed(2)} as PLP for vault yield (principal-preserving; fees not modeled here)`,
      );
    } else {
      parts.push(
        `allocates $${l.costUsd.toFixed(2)} to ${l.label} (model win prob ${(
          (l.fairPrice ?? 0) * 100
        ).toFixed(1)}%, pays $${(l.payoffIfWinUsd ?? 0).toFixed(2)} if it wins)`,
      );
    }
  }
  const hedges = legs.filter((l) => /HEDGE/.test(l.label));
  const hedgeNote = hedges.length
    ? ` A hedge leg caps left-tail drawdown.`
    : "";
  return (
    `This strategy ${parts.join("; ")}.` +
    hedgeNote +
    ` Expected PnL ${money(agg.expectedUsd)}, best ${money(agg.bestUsd)}, worst ${money(
      agg.worstUsd,
    )} (${(agg.capitalAtRisk * 100).toFixed(0)}% of capital). Probability of profit ${(
      agg.probProfit * 100
    ).toFixed(0)}%.`
  );
}

function money(x: number): string {
  return `${x >= 0 ? "+" : "-"}$${Math.abs(x).toFixed(2)}`;
}
