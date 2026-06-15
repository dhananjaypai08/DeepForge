import { ORACLE_STATUS } from "@deepforge/config";
import {
  dollarsToBaseUnits,
  priceToScaled,
  type MarketContext,
  type OracleInfo,
} from "@deepforge/config/market";
import { hashIR, validateIR, type StrategyIR } from "@deepforge/ir";
import { resolveRange, resolveStrike } from "./strike.js";
import type {
  CompileError,
  CompileResult,
  GraphEdge,
  GraphNode,
  LogicalPlan,
  ResolvedLeg,
  StrategyGraph,
} from "./types.js";

export * from "./types.js";
export { roundToTick, atmSigmaMove, atmTotalVariance } from "./strike.js";

/** Minimum time-to-expiry (ms) below which we refuse to compile a strategy. */
const MIN_TIME_TO_EXPIRY_MS = 60_000;
/** Below this we still compile but warn. */
const SHORT_EXPIRY_WARN_MS = 5 * 60_000;
/**
 * When selecting an oracle we ignore any expiring within this window — a
 * near-dead oracle has ~zero implied vol, so ATM strikes price at 0/1 and the
 * protocol can't quote them. We want a live, tradeable cycle.
 */
const SELECT_MIN_TTE_MS = 3 * 60_000;

/**
 * Select the oracle to use: matching underlying + ACTIVE, and whose expiry best
 * fits the IR's expiry policy (nearest, or nearest to the requested horizon).
 */
export function selectOracle(
  ir: StrategyIR,
  ctx: MarketContext,
): { oracle?: OracleInfo; error?: string } {
  const live = ctx.oracles.filter(
    (o) =>
      o.underlying.toUpperCase() === ir.asset &&
      o.status === ORACLE_STATUS.ACTIVE &&
      o.expiryMs > ctx.nowMs,
  );
  // Prefer oracles with comfortable time-to-expiry; fall back to any future one.
  const candidates =
    live.filter((o) => o.expiryMs > ctx.nowMs + SELECT_MIN_TTE_MS).length > 0
      ? live.filter((o) => o.expiryMs > ctx.nowMs + SELECT_MIN_TTE_MS)
      : live;
  if (candidates.length === 0) {
    return {
      error: `no tradeable ${ir.asset} oracle available right now (all are settled or about to expire) — try again in a moment`,
    };
  }
  const target =
    ir.expiry.mode === "rolling" && ir.expiry.horizonMs
      ? ctx.nowMs + ir.expiry.horizonMs
      : ir.expiry.horizonMs
        ? ctx.nowMs + ir.expiry.horizonMs
        : ctx.nowMs; // "nearest" => smallest future expiry
  const oracle = candidates.reduce((best, o) =>
    Math.abs(o.expiryMs - target) < Math.abs(best.expiryMs - target) ? o : best,
  );
  return { oracle };
}

/** Compile a strategy IR + live market data into a deterministic LogicalPlan. */
export function compile(input: StrategyIR | unknown, ctx: MarketContext): CompileResult {
  // 1. Re-validate IR (defensive — callers may pass untrusted objects).
  const v = validateIR(input);
  if (!v.ok) {
    return { ok: false, errors: v.errors };
  }
  const ir = v.ir;
  const errors: CompileError[] = [];
  const warnings: string[] = [];

  // 2. Resolve the oracle.
  const sel = selectOracle(ir, ctx);
  if (!sel.oracle) {
    return { ok: false, errors: [{ path: "expiry", message: sel.error ?? "no oracle" }] };
  }
  const oracle = sel.oracle;

  const ttl = oracle.expiryMs - ctx.nowMs;
  if (ttl < MIN_TIME_TO_EXPIRY_MS) {
    errors.push({
      path: "expiry",
      message: `selected oracle expires in ${Math.round(ttl / 1000)}s — too close to trade`,
    });
  } else if (ttl < SHORT_EXPIRY_WARN_MS) {
    warnings.push(
      `selected oracle expires in ${Math.round(ttl / 1000)}s — short window`,
    );
  }

  // 3. Lower each allocation to a resolved leg with a concrete strike + budget.
  const legs: ResolvedLeg[] = [];
  ir.allocations.forEach((a, i) => {
    const budget = dollarsToBaseUnits((ir.capital.amount * a.weightPct) / 100);
    if (budget <= 0n) {
      errors.push({
        path: `allocations.${i}`,
        message: `leg budget rounds to zero (weight ${a.weightPct}% of $${ir.capital.amount})`,
      });
      return;
    }
    switch (a.primitive) {
      case "binary_up":
      case "binary_down": {
        const strikeUsd = resolveStrike(a.strike, oracle);
        if (strikeUsd <= 0) {
          errors.push({ path: `allocations.${i}.strike`, message: "strike resolved <= 0" });
          return;
        }
        legs.push({
          kind: "binary",
          label: `${a.primitive === "binary_up" ? "UP" : "DOWN"} @ $${strikeUsd}`,
          direction: a.primitive === "binary_up" ? 0 : 1,
          strikeUsd,
          strikeScaled: priceToScaled(strikeUsd),
          budgetBaseUnits: budget,
        });
        break;
      }
      case "range": {
        const { lower, upper } = resolveRange(a.bounds, oracle);
        legs.push({
          kind: "range",
          label: `RANGE $${lower}–$${upper}`,
          lowerUsd: lower,
          upperUsd: upper,
          lowerScaled: priceToScaled(lower),
          higherScaled: priceToScaled(upper),
          budgetBaseUnits: budget,
        });
        break;
      }
      case "plp": {
        legs.push({ kind: "plp", label: "PLP supply", budgetBaseUnits: budget });
        break;
      }
      case "hedge": {
        const strikeUsd = resolveStrike(a.strike, oracle);
        legs.push({
          kind: "binary",
          label: `HEDGE ${a.side.toUpperCase()} @ $${strikeUsd}`,
          direction: a.side === "up" ? 0 : 1,
          strikeUsd,
          strikeScaled: priceToScaled(strikeUsd),
          budgetBaseUnits: budget,
        });
        break;
      }
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  const plan: LogicalPlan = {
    irHash: hashIR(ir),
    name: ir.name,
    asset: ir.asset,
    quote: "DUSDC",
    oracleId: oracle.id,
    expiryMs: oracle.expiryMs,
    capitalBaseUnits: dollarsToBaseUnits(ir.capital.amount),
    legs,
    autoRoll: ir.autoRoll ?? false,
    warnings,
  };

  return { ok: true, plan, graph: buildGraph(ir, plan) };
}

/** Build the DAG used by the visual builder and the execution replay. */
export function buildGraph(ir: StrategyIR, plan: LogicalPlan): StrategyGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const add = (n: GraphNode) => nodes.push(n);
  const link = (from: string, to: string) => edges.push({ from, to });

  add({
    id: "capital",
    kind: "capital",
    label: `Capital $${ir.capital.amount}`,
    budgetBaseUnits: plan.capitalBaseUnits,
  });
  add({ id: "allocator", kind: "allocator", label: "Allocator" });
  link("capital", "allocator");

  plan.legs.forEach((leg, i) => {
    const id = `leg${i}`;
    const kind = leg.kind === "binary" ? "binary" : leg.kind;
    add({
      id,
      kind,
      label: leg.label,
      budgetBaseUnits: leg.budgetBaseUnits,
    });
    link("allocator", id);
    link(id, "settlement");
  });

  add({ id: "settlement", kind: "settlement", label: "Settlement" });
  if (plan.autoRoll) {
    add({ id: "autoroll", kind: "autoroll", label: "Auto-roll" });
    link("settlement", "autoroll");
    link("autoroll", "exit");
  } else {
    link("settlement", "exit");
  }
  add({ id: "exit", kind: "exit", label: "Exit / Redeem" });

  return { nodes, edges };
}
