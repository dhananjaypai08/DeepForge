import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { SUI_CLOCK_OBJECT_ID, predictTargets } from "@deepforge/config";
import { ZERO_ADDRESS, type DeepforgeContext } from "./client.js";

export interface TradeAmounts {
  mintCostBase: bigint; // dUSDC base units to mint `quantity`
  redeemPayoutBase: bigint; // dUSDC base units returned to redeem `quantity`
}

export interface BinaryKeyParams {
  oracleId: string;
  expiryMs: number;
  strikeScaled: bigint;
  direction: 0 | 1;
}

export interface RangeKeyParams {
  oracleId: string;
  expiryMs: number;
  lowerScaled: bigint;
  higherScaled: bigint;
}

function decodeTwoU64(res: Awaited<ReturnType<DeepforgeContext["client"]["devInspectTransactionBlock"]>>): TradeAmounts {
  if (res.error) {
    const msg = String(res.error);
    const hint =
      /pricing_config|quote_spread|ask_bounds|MoveAbort/.test(msg)
        ? " — the protocol couldn't quote this leg (strike likely off the oracle grid, or the model price is too close to 0/1 to price). Move the strike nearer the forward, widen/narrow the range, or pick a longer expiry."
        : "";
    throw new Error(`pricing preview reverted${hint}`);
  }
  const rv = res.results?.at(-1)?.returnValues;
  if (!rv || rv.length < 2) {
    throw new Error(
      `expected 2 return values from preview, got ${rv?.length ?? 0}`,
    );
  }
  const [a] = rv[0]!;
  const [b] = rv[1]!;
  return {
    mintCostBase: BigInt(bcs.u64().parse(Uint8Array.from(a))),
    redeemPayoutBase: BigInt(bcs.u64().parse(Uint8Array.from(b))),
  };
}

/** Preview a binary mint/redeem via devInspect (no gas spent, exact cost). */
export async function previewBinary(
  ctx: DeepforgeContext,
  key: BinaryKeyParams,
  quantity: bigint,
  sender: string = ZERO_ADDRESS,
): Promise<TradeAmounts> {
  const t = predictTargets(ctx.deployment.predictPackageId);
  const tx = new Transaction();
  const marketKey = tx.moveCall({
    target: key.direction === 0 ? t.marketKeyUp : t.marketKeyDown,
    arguments: [
      tx.pure.id(key.oracleId),
      tx.pure.u64(key.expiryMs),
      tx.pure.u64(key.strikeScaled),
    ],
  });
  tx.moveCall({
    target: t.getTradeAmounts,
    arguments: [
      tx.object(ctx.deployment.predictObjectId),
      tx.object(key.oracleId),
      marketKey,
      tx.pure.u64(quantity),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  const res = await ctx.client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  return decodeTwoU64(res);
}

/** Preview a vertical-range mint/redeem via devInspect. */
export async function previewRange(
  ctx: DeepforgeContext,
  key: RangeKeyParams,
  quantity: bigint,
  sender: string = ZERO_ADDRESS,
): Promise<TradeAmounts> {
  const t = predictTargets(ctx.deployment.predictPackageId);
  const tx = new Transaction();
  const rangeKey = tx.moveCall({
    target: t.rangeKeyNew,
    arguments: [
      tx.pure.id(key.oracleId),
      tx.pure.u64(key.expiryMs),
      tx.pure.u64(key.lowerScaled),
      tx.pure.u64(key.higherScaled),
    ],
  });
  tx.moveCall({
    target: t.getRangeTradeAmounts,
    arguments: [
      tx.object(ctx.deployment.predictObjectId),
      tx.object(key.oracleId),
      rangeKey,
      tx.pure.u64(quantity),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  const res = await ctx.client.devInspectTransactionBlock({
    sender,
    transactionBlock: tx,
  });
  return decodeTwoU64(res);
}
