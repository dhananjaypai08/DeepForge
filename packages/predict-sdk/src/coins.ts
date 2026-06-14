import type { DeepforgeContext } from "./client.js";

export interface QuoteCoins {
  coinObjectIds: string[];
  totalBalanceBase: bigint;
}

/** Fetch all dUSDC coin objects owned by `owner` (paginated). */
export async function getQuoteCoins(
  ctx: DeepforgeContext,
  owner: string,
): Promise<QuoteCoins> {
  const coinType = ctx.deployment.dusdcType;
  const ids: string[] = [];
  let total = 0n;
  let cursor: string | null | undefined = undefined;
  do {
    const page = await ctx.client.getCoins({ owner, coinType, cursor });
    for (const c of page.data) {
      ids.push(c.coinObjectId);
      total += BigInt(c.balance);
    }
    cursor = page.hasNextPage ? page.nextCursor : undefined;
  } while (cursor);
  return { coinObjectIds: ids, totalBalanceBase: total };
}
