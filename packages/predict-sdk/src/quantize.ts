import { QUOTE_UNIT } from "@deepforge/config";
import type { LogicalPlan } from "@deepforge/compiler";
import type { DeepforgeContext } from "./client.js";
import { previewBinary, previewRange } from "./preview.js";
import type { ExecStep, ExecutionPlan } from "./types.js";

/** $1 of payoff face, used as the linear price probe. */
const PROBE_QTY = QUOTE_UNIT; // 1_000_000n

export interface QuantizeOptions {
  sender?: string;
}

/**
 * Quantize a compiler LogicalPlan into a chain-ready ExecutionPlan. For each
 * mint/range leg we probe the live price with devInspect, invert cost->quantity
 * to hit the leg's budget, then re-preview at that quantity to capture the exact
 * cost the protocol will charge. No invented numbers: every cost is on-chain.
 */
export async function buildExecutionPlan(
  ctx: DeepforgeContext,
  plan: LogicalPlan,
  opts: QuantizeOptions = {},
): Promise<ExecutionPlan> {
  const steps: ExecStep[] = [];
  const unitCosts: Record<number, number> = {};
  let depositBase = 0n;
  let supplyBase = 0n;

  for (let i = 0; i < plan.legs.length; i++) {
    const leg = plan.legs[i]!;
    try {
      if (leg.kind === "plp") {
        supplyBase += leg.budgetBaseUnits;
        steps.push({
          op: "supply",
          legLabel: leg.label,
          amountBaseUnits: leg.budgetBaseUnits.toString(),
        });
        continue;
      }

      if (leg.kind === "binary") {
        const key = {
          oracleId: plan.oracleId,
          expiryMs: plan.expiryMs,
          strikeScaled: leg.strikeScaled,
          direction: leg.direction,
        };
        const probe = await previewBinary(ctx, key, PROBE_QTY, opts.sender);
        const quantity = invertQuantity(leg.budgetBaseUnits, probe.mintCostBase);
        const actual = await previewBinary(ctx, key, quantity, opts.sender);
        depositBase += actual.mintCostBase;
        unitCosts[i] = Number(actual.mintCostBase) / Number(quantity);
        steps.push({
          op: "mint",
          legLabel: leg.label,
          oracleId: plan.oracleId,
          expiryMs: plan.expiryMs,
          strikeScaled: leg.strikeScaled.toString(),
          direction: leg.direction,
          quantity: quantity.toString(),
          costBaseUnits: actual.mintCostBase.toString(),
        });
        continue;
      }

      // range
      const key = {
        oracleId: plan.oracleId,
        expiryMs: plan.expiryMs,
        lowerScaled: leg.lowerScaled,
        higherScaled: leg.higherScaled,
      };
      const probe = await previewRange(ctx, key, PROBE_QTY, opts.sender);
      const quantity = invertQuantity(leg.budgetBaseUnits, probe.mintCostBase);
      const actual = await previewRange(ctx, key, quantity, opts.sender);
      depositBase += actual.mintCostBase;
      unitCosts[i] = Number(actual.mintCostBase) / Number(quantity);
      steps.push({
        op: "mint_range",
        legLabel: leg.label,
        oracleId: plan.oracleId,
        expiryMs: plan.expiryMs,
        lowerScaled: leg.lowerScaled.toString(),
        higherScaled: leg.higherScaled.toString(),
        quantity: quantity.toString(),
        costBaseUnits: actual.mintCostBase.toString(),
      });
    } catch (e) {
      throw new Error(`leg ${i} (${leg.label}): ${(e as Error).message}`);
    }
  }

  // Deposit a small slippage buffer above the previewed cost: the live price can
  // tick up between this devInspect preview and on-chain execution, and mint
  // pulls the *actual* cost from the manager — too tight a deposit aborts the
  // withdraw. Any unused buffer simply stays in the manager (withdrawable).
  const SLIPPAGE_BPS = 500n; // 5%
  const bufferedDeposit =
    depositBase === 0n ? 0n : depositBase + (depositBase * SLIPPAGE_BPS) / 10_000n;

  return {
    irHash: plan.irHash,
    name: plan.name,
    oracleId: plan.oracleId,
    expiryMs: plan.expiryMs,
    quoteType: ctx.deployment.dusdcType,
    plpType: ctx.deployment.plpType,
    depositBaseUnits: bufferedDeposit.toString(),
    supplyBaseUnits: supplyBase.toString(),
    totalQuoteBaseUnits: (bufferedDeposit + supplyBase).toString(),
    steps,
    unitCosts,
  };
}

/** quantity = budget / unitAsk, computed from a linear probe. */
function invertQuantity(budgetBase: bigint, probeCostBase: bigint): bigint {
  if (probeCostBase <= 0n) {
    throw new Error("zero/invalid mint cost at probe");
  }
  const quantity = (budgetBase * PROBE_QTY) / probeCostBase;
  if (quantity <= 0n) {
    throw new Error("budget too small to buy 1 unit");
  }
  return quantity;
}
