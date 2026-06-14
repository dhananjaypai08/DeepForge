import type { DeepforgeContext } from "./client.js";
import type { VaultState } from "./vault.js";

/**
 * Best-effort client for the public Predict indexer. The exact route shapes are
 * not formally documented for the predict-testnet-4-16 branch, so every call is
 * defensive: it tries a few candidate paths and returns null on failure. The
 * authoritative data path is always on-chain reads (oracle.ts / vault.ts); the
 * server is an optimization for discovery and lists.
 */

async function tryJson(url: string, timeoutMs = 4000): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

function extractIds(payload: unknown): string[] {
  const arr = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as any).data)
      ? (payload as any).data
      : [];
  const ids = new Set<string>();
  for (const item of arr as unknown[]) {
    if (typeof item === "string" && item.startsWith("0x")) ids.add(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      for (const key of ["id", "oracle_id", "oracleId", "objectId", "object_id"]) {
        const v = o[key];
        if (typeof v === "string" && v.startsWith("0x")) {
          ids.add(v);
          break;
        }
      }
    }
  }
  return [...ids];
}

/** Try to discover oracle object ids from the indexer. Empty array on failure. */
export async function discoverOracleIds(ctx: DeepforgeContext): Promise<string[]> {
  const base = ctx.predictServerUrl.replace(/\/$/, "");
  const candidates = [
    `${base}/oracles`,
    `${base}/predicts/${ctx.deployment.predictObjectId}/oracles`,
  ];
  for (const url of candidates) {
    const payload = await tryJson(url);
    const ids = extractIds(payload);
    if (ids.length) return ids;
  }
  return [];
}

/** Try to read a vault summary from the indexer (USD-ish numbers). */
export async function fetchVaultSummary(
  ctx: DeepforgeContext,
): Promise<Partial<VaultState> | null> {
  const base = ctx.predictServerUrl.replace(/\/$/, "");
  const payload = await tryJson(
    `${base}/predicts/${ctx.deployment.predictObjectId}/vault/summary`,
  );
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const num = (k: string[]): number | undefined => {
    for (const key of k) {
      const v = o[key];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
        return Number(v);
    }
    return undefined;
  };
  return {
    valueUsd: num(["value", "vault_value", "vaultValue"]),
    totalMtmUsd: num(["total_mtm", "totalMtm", "mtm"]),
    totalMaxPayoutUsd: num(["total_max_payout", "totalMaxPayout", "max_payout"]),
    availableWithdrawalUsd: num(["available_withdrawal", "availableWithdrawal"]),
  };
}
