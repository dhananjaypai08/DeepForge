import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { SUI_CLOCK_OBJECT_ID, predictTargets } from "@deepforge/config";
import { baseUnitsToDollars } from "@deepforge/config/market";
import { ZERO_ADDRESS, type DeepforgeContext } from "./client.js";

export interface VaultState {
  valueUsd: number;
  totalMtmUsd: number;
  totalMaxPayoutUsd: number;
  availableWithdrawalUsd: number;
  balanceUsd: number;
}

function unwrap(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && "fields" in (v as Record<string, unknown>)) {
    return (v as { fields: Record<string, unknown> }).fields;
  }
  return (v ?? {}) as Record<string, unknown>;
}

/** Read live vault state from the shared Predict object + available_withdrawal. */
export async function getVaultState(ctx: DeepforgeContext): Promise<VaultState> {
  const resp = await ctx.client.getObject({
    id: ctx.deployment.predictObjectId,
    options: { showContent: true },
  });
  if (resp.error || !resp.data || resp.data.content?.dataType !== "moveObject") {
    throw new Error(`failed to read Predict object: ${JSON.stringify(resp.error)}`);
  }
  const fields = resp.data.content.fields as Record<string, unknown>;
  const vault = unwrap(fields.vault);

  const balance = baseUnitsToDollars(BigInt(String(vault.balance ?? 0)));
  const totalMtm = baseUnitsToDollars(BigInt(String(vault.total_mtm ?? 0)));
  const totalMaxPayout = baseUnitsToDollars(
    BigInt(String(vault.total_max_payout ?? 0)),
  );

  let availableWithdrawalUsd = 0;
  try {
    availableWithdrawalUsd = await readAvailableWithdrawal(ctx);
  } catch {
    availableWithdrawalUsd = Math.max(0, balance - totalMtm);
  }
  // When the withdrawal limiter is unlimited the contract returns ~u64::MAX;
  // a withdrawal can never exceed the vault balance, so clamp for sanity.
  availableWithdrawalUsd = Math.min(availableWithdrawalUsd, balance);

  return {
    balanceUsd: balance,
    totalMtmUsd: totalMtm,
    totalMaxPayoutUsd: totalMaxPayout,
    valueUsd: balance - totalMtm,
    availableWithdrawalUsd,
  };
}

async function readAvailableWithdrawal(ctx: DeepforgeContext): Promise<number> {
  const t = predictTargets(ctx.deployment.predictPackageId);
  const tx = new Transaction();
  tx.moveCall({
    target: t.availableWithdrawal,
    arguments: [tx.object(ctx.deployment.predictObjectId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  const res = await ctx.client.devInspectTransactionBlock({
    sender: ZERO_ADDRESS,
    transactionBlock: tx,
  });
  const rv = res.results?.at(-1)?.returnValues;
  if (!rv || rv.length === 0) {
    throw new Error("available_withdrawal returned no value");
  }
  const [bytes] = rv[0]!;
  const base = BigInt(bcs.u64().parse(Uint8Array.from(bytes)));
  return baseUnitsToDollars(base);
}
