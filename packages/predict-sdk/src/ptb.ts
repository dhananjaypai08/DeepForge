import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import type { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { SUI_CLOCK_OBJECT_ID, predictTargets } from "@deepforge/config";
import type { DeepforgeContext } from "./client.js";
import type { ExecutionPlan } from "./types.js";

const PREDICT_MANAGER_SUFFIX = "::predict_manager::PredictManager";

/** Build a PTB that creates a (shared) PredictManager for the sender. */
export function buildCreateManagerTx(ctx: DeepforgeContext): Transaction {
  const t = predictTargets(ctx.deployment.predictPackageId);
  const tx = new Transaction();
  tx.moveCall({ target: t.createManager, arguments: [] });
  return tx;
}

/** Pull the created PredictManager object id out of an executed tx response. */
export function extractCreatedManagerId(
  res: SuiTransactionBlockResponse,
): string | undefined {
  for (const ch of res.objectChanges ?? []) {
    if (ch.type === "created" && ch.objectType.endsWith(PREDICT_MANAGER_SUFFIX)) {
      return ch.objectId;
    }
  }
  return undefined;
}

export interface BuildExecutionOptions {
  managerId: string;
  /** dUSDC coin object ids owned by the sender to fund the strategy. */
  quoteCoinIds: string[];
  /** Sender address — receives PLP shares and any change. */
  sender: string;
}

/**
 * Build the execution PTB for a quantized ExecutionPlan: fund the manager,
 * mint binaries/ranges (which pull from the manager balance), and supply PLP.
 */
export function buildExecutionPTB(
  ctx: DeepforgeContext,
  plan: ExecutionPlan,
  opts: BuildExecutionOptions,
): Transaction {
  if (opts.quoteCoinIds.length === 0) {
    throw new Error("no dUSDC coins provided to fund the strategy");
  }
  const t = predictTargets(ctx.deployment.predictPackageId);
  const quote = plan.quoteType;
  const tx = new Transaction();

  // Consolidate dUSDC into a single primary coin to split from.
  const primary = tx.object(opts.quoteCoinIds[0]!);
  if (opts.quoteCoinIds.length > 1) {
    tx.mergeCoins(
      primary,
      opts.quoteCoinIds.slice(1).map((id) => tx.object(id)),
    );
  }

  // 1. Fund the manager for all mint/range legs.
  const deposit = BigInt(plan.depositBaseUnits);
  if (deposit > 0n) {
    const [depCoin] = tx.splitCoins(primary, [tx.pure.u64(deposit)]);
    tx.moveCall({
      target: t.managerDeposit,
      typeArguments: [quote],
      arguments: [tx.object(opts.managerId), depCoin as TransactionObjectArgument],
    });
  }

  // 2. Mint / range legs (pull funds from the manager).
  for (const step of plan.steps) {
    if (step.op === "mint") {
      const key = tx.moveCall({
        target: step.direction === 0 ? t.marketKeyUp : t.marketKeyDown,
        arguments: [
          tx.pure.id(step.oracleId),
          tx.pure.u64(step.expiryMs),
          tx.pure.u64(BigInt(step.strikeScaled)),
        ],
      });
      tx.moveCall({
        target: t.mint,
        typeArguments: [quote],
        arguments: [
          tx.object(ctx.deployment.predictObjectId),
          tx.object(opts.managerId),
          tx.object(step.oracleId),
          key,
          tx.pure.u64(BigInt(step.quantity)),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
    } else if (step.op === "mint_range") {
      const key = tx.moveCall({
        target: t.rangeKeyNew,
        arguments: [
          tx.pure.id(step.oracleId),
          tx.pure.u64(step.expiryMs),
          tx.pure.u64(BigInt(step.lowerScaled)),
          tx.pure.u64(BigInt(step.higherScaled)),
        ],
      });
      tx.moveCall({
        target: t.mintRange,
        typeArguments: [quote],
        arguments: [
          tx.object(ctx.deployment.predictObjectId),
          tx.object(opts.managerId),
          tx.object(step.oracleId),
          key,
          tx.pure.u64(BigInt(step.quantity)),
          tx.object(SUI_CLOCK_OBJECT_ID),
        ],
      });
    }
  }

  // 3. PLP supply legs (route quote directly into the vault, return PLP).
  for (const step of plan.steps) {
    if (step.op !== "supply") continue;
    const [supCoin] = tx.splitCoins(primary, [tx.pure.u64(BigInt(step.amountBaseUnits))]);
    const plp = tx.moveCall({
      target: t.supply,
      typeArguments: [quote],
      arguments: [
        tx.object(ctx.deployment.predictObjectId),
        supCoin as TransactionObjectArgument,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    tx.transferObjects([plp], tx.pure.address(opts.sender));
  }

  return tx;
}

export interface RedeemParams {
  managerId: string;
  oracleId: string;
  expiryMs: number;
  quantity: bigint;
  strikeScaled?: bigint;
  direction?: 0 | 1;
  range?: { lowerScaled: bigint; higherScaled: bigint };
}

/**
 * Build a permissionless-redeem PTB for a settled position (used by the keeper
 * and the auto-roll flow). Provide either {strikeScaled,direction} for a binary
 * or {range} for a vertical range.
 */
export function buildRedeemPermissionlessTx(
  ctx: DeepforgeContext,
  p: RedeemParams,
): Transaction {
  const t = predictTargets(ctx.deployment.predictPackageId);
  const quote = ctx.deployment.dusdcType;
  const tx = new Transaction();

  if (p.range) {
    const key = tx.moveCall({
      target: t.rangeKeyNew,
      arguments: [
        tx.pure.id(p.oracleId),
        tx.pure.u64(p.expiryMs),
        tx.pure.u64(p.range.lowerScaled),
        tx.pure.u64(p.range.higherScaled),
      ],
    });
    tx.moveCall({
      target: t.redeemRange,
      typeArguments: [quote],
      arguments: [
        tx.object(ctx.deployment.predictObjectId),
        tx.object(p.managerId),
        tx.object(p.oracleId),
        key,
        tx.pure.u64(p.quantity),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  if (p.strikeScaled === undefined || p.direction === undefined) {
    throw new Error("binary redeem requires strikeScaled and direction");
  }
  const key = tx.moveCall({
    target: p.direction === 0 ? t.marketKeyUp : t.marketKeyDown,
    arguments: [
      tx.pure.id(p.oracleId),
      tx.pure.u64(p.expiryMs),
      tx.pure.u64(p.strikeScaled),
    ],
  });
  tx.moveCall({
    target: t.redeemPermissionless,
    typeArguments: [quote],
    arguments: [
      tx.object(ctx.deployment.predictObjectId),
      tx.object(p.managerId),
      tx.object(p.oracleId),
      key,
      tx.pure.u64(p.quantity),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}
