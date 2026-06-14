import type { SuiObjectData, SuiObjectResponse } from "@mysten/sui/client";
import {
  DEFAULT_STRIKE_TICK_USD,
  FLOAT_SCALING_NUM,
  ORACLE_STATUS,
  type OracleStatus,
} from "@deepforge/config";
import type { OracleInfo, SVI } from "@deepforge/config/market";
import type { DeepforgeContext } from "./client.js";

// Move object content fields are wrapped as { type, fields } for nested structs.
function unwrap(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && "fields" in (v as Record<string, unknown>)) {
    return (v as { fields: Record<string, unknown> }).fields;
  }
  return (v ?? {}) as Record<string, unknown>;
}

function parseI64(v: unknown): number {
  const f = unwrap(v);
  const mag = Number(f.magnitude ?? 0) / FLOAT_SCALING_NUM;
  return f.is_negative ? -mag : mag;
}

function parseOptionU64(v: unknown): bigint | undefined {
  if (v === null || v === undefined) return undefined;
  // std::option::Option<u64> => { fields: { vec: ["123"] } } or { vec: [...] }
  const f = unwrap(v);
  const vec = (f.vec ?? (Array.isArray(v) ? v : undefined)) as unknown[] | undefined;
  if (Array.isArray(vec)) return vec.length ? BigInt(String(vec[0])) : undefined;
  if (typeof v === "string" || typeof v === "number") return BigInt(String(v));
  return undefined;
}

function deriveStatus(
  active: boolean,
  expiryMs: number,
  settled: boolean,
  nowMs: number,
): OracleStatus {
  if (settled) return ORACLE_STATUS.SETTLED;
  if (!active) return ORACLE_STATUS.INACTIVE;
  if (nowMs >= expiryMs) return ORACLE_STATUS.PENDING_SETTLEMENT;
  return ORACLE_STATUS.ACTIVE;
}

/** Parse an OracleSVI Sui object into a human-unit OracleInfo. */
export function parseOracleObject(
  data: SuiObjectData,
  nowMs: number,
  tickSize = DEFAULT_STRIKE_TICK_USD,
): OracleInfo {
  const content = data.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`object ${data.objectId} is not a Move object`);
  }
  const fields = content.fields as Record<string, unknown>;
  const prices = unwrap(fields.prices);
  const sviRaw = unwrap(fields.svi);

  const spot = Number(prices.spot ?? 0) / FLOAT_SCALING_NUM;
  const forward = Number(prices.forward ?? 0) / FLOAT_SCALING_NUM;
  const svi: SVI = {
    a: Number(sviRaw.a ?? 0) / FLOAT_SCALING_NUM,
    b: Number(sviRaw.b ?? 0) / FLOAT_SCALING_NUM,
    rho: parseI64(sviRaw.rho),
    m: parseI64(sviRaw.m),
    sigma: Number(sviRaw.sigma ?? 0) / FLOAT_SCALING_NUM,
  };
  const expiryMs = Number(fields.expiry ?? 0);
  const active = Boolean(fields.active);
  const settlementScaled = parseOptionU64(fields.settlement_price);
  const settled = settlementScaled !== undefined;

  return {
    id: data.objectId,
    underlying: String(fields.underlying_asset ?? ""),
    expiryMs,
    status: deriveStatus(active, expiryMs, settled, nowMs),
    spot,
    forward,
    svi,
    tickSize,
    settlementPrice:
      settlementScaled !== undefined
        ? Number(settlementScaled) / FLOAT_SCALING_NUM
        : undefined,
    timestampMs: Number(fields.timestamp ?? 0),
  };
}

function dataFrom(resp: SuiObjectResponse): SuiObjectData {
  if (resp.error || !resp.data) {
    throw new Error(`failed to read oracle: ${JSON.stringify(resp.error)}`);
  }
  return resp.data;
}

/** Read a single oracle by object id from chain. */
export async function getOracle(
  ctx: DeepforgeContext,
  oracleId: string,
  opts: { nowMs?: number; tickSize?: number } = {},
): Promise<OracleInfo> {
  const resp = await ctx.client.getObject({
    id: oracleId,
    options: { showContent: true },
  });
  return parseOracleObject(dataFrom(resp), opts.nowMs ?? Date.now(), opts.tickSize);
}

/** Read multiple oracles by id (single batched RPC). */
export async function getOraclesByIds(
  ctx: DeepforgeContext,
  ids: string[],
  opts: { nowMs?: number; tickSize?: number } = {},
): Promise<OracleInfo[]> {
  if (ids.length === 0) return [];
  const now = opts.nowMs ?? Date.now();
  const out: OracleInfo[] = [];
  // multiGetObjects accepts at most 50 ids per call.
  for (let i = 0; i < ids.length; i += 50) {
    const resp = await ctx.client.multiGetObjects({
      ids: ids.slice(i, i + 50),
      options: { showContent: true },
    });
    for (const r of resp) {
      if (r.data && !r.error) {
        try {
          out.push(parseOracleObject(r.data as SuiObjectData, now, opts.tickSize));
        } catch {
          // skip objects that aren't parseable oracles
        }
      }
    }
  }
  return out;
}
