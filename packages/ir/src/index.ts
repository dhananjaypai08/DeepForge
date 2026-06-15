import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { zodToJsonSchema } from "zod-to-json-schema";
import { StrategyIR, IR_VERSION } from "./schema.js";

export * from "./schema.js";

export interface ValidationOk {
  ok: true;
  ir: StrategyIR;
}
export interface ValidationErr {
  ok: false;
  errors: { path: string; message: string }[];
}
export type ValidationResult = ValidationOk | ValidationErr;

/** Validate an arbitrary object against the IR schema. */
export function validateIR(input: unknown): ValidationResult {
  const res = StrategyIR.safeParse(input);
  if (res.success) return { ok: true, ir: res.data };
  return {
    ok: false,
    errors: res.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

/** Parse a `*.deepforge.yaml` document into a validated IR (throws on error). */
export function parseDeepforgeFile(text: string): StrategyIR {
  let raw: unknown;
  try {
    raw = yamlParse(text);
  } catch (e) {
    throw new Error(`invalid YAML: ${(e as Error).message}`);
  }
  const res = validateIR(raw);
  if (!res.ok) {
    throw new Error(
      "invalid DeepForge file:\n" +
        res.errors.map((e) => `  - ${e.path || "(root)"}: ${e.message}`).join("\n"),
    );
  }
  return res.ir;
}

/**
 * Canonicalize an object by recursively sorting keys, so serialization and
 * hashing are stable regardless of authoring order.
 */
function canonicalize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(canonicalize) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = canonicalize(v);
    }
    return out as T;
  }
  return value;
}

/** Serialize an IR to canonical YAML (`*.deepforge.yaml` content). */
export function serializeDeepforgeFile(ir: StrategyIR): string {
  return yamlStringify(canonicalize(ir), { sortMapEntries: true });
}

/** Format/normalize a file's text: validate then re-emit canonically. */
export function fmtDeepforgeFile(text: string): string {
  return serializeDeepforgeFile(parseDeepforgeFile(text));
}

/** Stable canonical JSON for hashing. */
export function canonicalJSON(ir: StrategyIR): string {
  return JSON.stringify(canonicalize(ir));
}

/**
 * Content hash of an IR (sha256 of canonical JSON), hex-encoded. Used as the
 * `ir_hash` recorded in the on-chain Strategy object so a published strategy is
 * verifiably tied to a specific declarative definition.
 */
export function hashIR(ir: StrategyIR): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJSON(ir))));
}

/**
 * Inline JSON Schema for the IR — used as the OpenRouter tool/function schema.
 * No `name` wrapper and refs inlined, so the result is a plain root object
 * schema suitable for OpenAI-style function calling.
 */
export function irJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(StrategyIR, { $refStrategy: "none" }) as Record<
    string,
    unknown
  >;
}

/**
 * A minimal valid IR scaffold. Strikes are ATM-relative (offsets/widths around
 * the live forward) rather than absolute prices, so it compiles cleanly against
 * whatever the oracle's current spot is. The 1h horizon picks an oracle with
 * enough implied vol to quote meaningful (non-degenerate) prices.
 */
export function exampleIR(): StrategyIR {
  return {
    version: IR_VERSION,
    name: "BTC range harvest",
    asset: "BTC",
    capital: { amount: 50, quote: "DUSDC" },
    view: { kind: "range", bias: "neutral" },
    expiry: { mode: "nearest", horizonMs: 60 * 60 * 1000 },
    risk: { maxLossPct: 40 },
    allocations: [
      { primitive: "range", weightPct: 60, bounds: { widthBps: 75 } },
      {
        primitive: "binary_up",
        weightPct: 40,
        strike: { atmOffsetBps: 25 },
      },
    ],
    autoRoll: false,
  };
}
