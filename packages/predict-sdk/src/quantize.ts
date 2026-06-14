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
      const probe = await previewBinary(
        ctx,
        {
          oracleId: plan.oracleId,
          expiryMs: plan.expiryMs,
          strikeScaled: leg.strikeScaled,
          direction: leg.direction,
        },
        PROBE_QTY,
        opts.sender,
      );
      if (probe.mintCostBase <= 0n) {
        throw new Error(`leg ${i} (${leg.label}): zero/invalid mint cost at probe`);
      }
      const quantity = (leg.budgetBaseUnits * PROBE_QTY) / probe.mintCostBase;
      if (quantity <= 0n) {
        throw new Error(`leg ${i} (${leg.label}): budget too small to buy 1 unit`);
      }
      const actual = await previewBinary(
        ctx,
        {
          oracleId: plan.oracleId,
          expiryMs: plan.expiryMs,
          strikeScaled: leg.strikeScaled,
          direction: leg.direction,
        },
        quantity,
        opts.sender,
      );
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
    const probe = await previewRange(
      ctx,
      {
        oracleId: plan.oracleId,
        expiryMs: plan.expiryMs,
        lowerScaled: leg.lowerScaled,
        higherScaled: leg.higherScaled,
      },
      PROBE_QTY,
      opts.sender,
    );
    if (probe.mintCostBase <= 0n) {
      throw new Error(`leg ${i} (${leg.label}): zero/invalid range mint cost at probe`);
    }
    const quantity = (leg.budgetBaseUnits * PROBE_QTY) / probe.mintCostBase;
    if (quantity <= 0n) {
      throw new Error(`leg ${i} (${leg.label}): budget too small to buy 1 unit`);
    }
    const actual = await previewRange(
      ctx,
      {
        oracleId: plan.oracleId,
        expiryMs: plan.expiryMs,
        lowerScaled: leg.lowerScaled,
        higherScaled: leg.higherScaled,
      },
      quantity,
      opts.sender,
    );
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
  }

  return {
    irHash: plan.irHash,
    name: plan.name,
    oracleId: plan.oracleId,
    expiryMs: plan.expiryMs,
    quoteType: ctx.deployment.dusdcType,
    plpType: ctx.deployment.plpType,
    depositBaseUnits: depositBase.toString(),
    supplyBaseUnits: supplyBase.toString(),
    totalQuoteBaseUnits: (depositBase + supplyBase).toString(),
    steps,
    unitCosts,
  };
}
