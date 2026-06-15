import { describe, it, expect } from "vitest";
import { ORACLE_STATUS } from "@deepforge/config";
import { scaledToPrice, type MarketContext } from "@deepforge/config/market";
import { exampleIR, type StrategyIR } from "@deepforge/ir";
import { compile } from "./index.js";

const NOW = 1_700_000_000_000;

function ctx(): MarketContext {
  return {
    nowMs: NOW,
    oracles: [
      {
        id: "0xoracle_btc_1h",
        underlying: "BTC",
        expiryMs: NOW + 60 * 60 * 1000,
        status: ORACLE_STATUS.ACTIVE,
        spot: 119_000,
        forward: 119_100,
        svi: { a: 0.0001, b: 0.02, rho: -0.3, m: 0.0, sigma: 0.1 },
        tickSize: 100,
        timestampMs: NOW,
      },
      {
        id: "0xoracle_btc_settled",
        underlying: "BTC",
        expiryMs: NOW - 1000,
        status: ORACLE_STATUS.SETTLED,
        spot: 119_000,
        forward: 119_000,
        svi: { a: 0.0001, b: 0.02, rho: -0.3, m: 0, sigma: 0.1 },
        tickSize: 100,
        timestampMs: NOW,
      },
    ],
  };
}

describe("compile", () => {
  it("compiles the example range+binary strategy", () => {
    const res = compile(exampleIR(), ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.oracleId).toBe("0xoracle_btc_1h");
    expect(res.plan.legs).toHaveLength(2);
    const range = res.plan.legs.find((l) => l.kind === "range");
    expect(range).toBeDefined();
    // 60% of $2 = $1.2 -> 1_200_000 base units
    expect(range?.budgetBaseUnits).toBe(1_200_000n);
    const binary = res.plan.legs.find((l) => l.kind === "binary");
    expect(binary).toBeDefined();
  });

  it("rounds strikes to the oracle tick size", () => {
    const ir: StrategyIR = {
      ...exampleIR(),
      allocations: [
        {
          primitive: "binary_up",
          weightPct: 100,
          strike: { price: 119_137 },
        },
      ],
    };
    const res = compile(ir, ctx());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const leg = res.plan.legs[0];
    expect(leg?.kind).toBe("binary");
    if (leg?.kind === "binary") {
      expect(leg.strikeUsd % 100).toBe(0);
      expect(leg.strikeUsd).toBe(119_100);
      expect(scaledToPrice(leg.strikeScaled)).toBeCloseTo(119_100, 3);
    }
  });

  it("ignores settled oracles and selects the active one", () => {
    const res = compile(exampleIR(), ctx());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.plan.oracleId).toBe("0xoracle_btc_1h");
  });

  it("errors when no active oracle exists", () => {
    const c = ctx();
    c.oracles = c.oracles.filter((o) => o.status !== ORACLE_STATUS.ACTIVE);
    const res = compile(exampleIR(), c);
    expect(res.ok).toBe(false);
  });

  it("builds a graph with capital, legs, settlement and exit", () => {
    const res = compile(exampleIR(), ctx());
    if (!res.ok) throw new Error("expected ok");
    const kinds = res.graph.nodes.map((n) => n.kind);
    expect(kinds).toContain("capital");
    expect(kinds).toContain("allocator");
    expect(kinds).toContain("settlement");
    expect(kinds).toContain("exit");
  });
});
