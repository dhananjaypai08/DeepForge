import type { MarketContext, OracleInfo } from "@deepforge/config/market";
import type { DeepforgeContext } from "./client.js";
import { getOraclesByIds } from "./oracle.js";
import { discoverOracleIds } from "./server.js";

export interface MarketContextOptions {
  /** Explicit oracle ids to read (skips indexer discovery). */
  oracleIds?: string[];
  nowMs?: number;
  tickSize?: number;
  /** Cap on how many discovered oracles to read on-chain (default 80). */
  maxOracles?: number;
}

/**
 * Build a MarketContext for the compiler: discover oracle ids (explicit, then
 * indexer) and read each oracle's live state on-chain (authoritative).
 */
export async function buildMarketContext(
  ctx: DeepforgeContext,
  opts: MarketContextOptions = {},
): Promise<MarketContext> {
  const nowMs = opts.nowMs ?? Date.now();
  let ids = opts.oracleIds ?? [];
  if (ids.length === 0) ids = await discoverOracleIds(ctx);
  ids = ids.slice(0, opts.maxOracles ?? 80);
  const oracles: OracleInfo[] = await getOraclesByIds(ctx, ids, {
    nowMs,
    tickSize: opts.tickSize,
  });
  return { nowMs, oracles };
}
