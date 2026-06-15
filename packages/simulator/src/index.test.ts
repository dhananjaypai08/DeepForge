import { describe, it, expect } from "vitest";
import { ORACLE_STATUS } from "@deepforge/config";
import type { OracleInfo } from "@deepforge/config/market";
import { compile } from "@deepforge/compiler";
import { exampleIR, type StrategyIR } from "@deepforge/ir";
import { binaryUpPrice, normalCdf, rangePrice, simulate } from "./index.js";

const NOW = 1_700_000_000_000;
const oracle: OracleInfo = {
  id: "0xoracle",
  underlying: "BTC",
  expiryMs: NOW + 60 * 60 * 1000,
  status: ORACLE_STATUS.ACTIVE,
  spot: 119_000,
  forward: 119_000,
  svi: { a: 0.0004, b: 0.02, rho: -0.2, m: 0, sigma: 0.2 },
  tickSize: 100,
  timestampMs: NOW,
};

function mkCtx() {
  return { nowMs: NOW, oracles: [oracle] };
}

describe("pricing", () => {
  it("normalCdf is calibrated", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("ATM binary up price is near 0.5", () => {
    expect(binaryUpPrice(oracle, oracle.forward)).toBeGreaterThan(0.45);
    expect(binaryUpPrice(oracle, oracle.forward)).toBeLessThan(0.55);
  });

  it("deep ITM up price approaches 1, deep OTM approaches 0", () => {
    expect(binaryUpPrice(oracle, oracle.forward * 0.5)).toBeGreaterThan(0.99);
    expect(binaryUpPrice(oracle, oracle.forward * 2)).toBeLessThan(0.01);
  });

  it("a wide range has higher in-range probability than a narrow one", () => {
    const wide = rangePrice(oracle, 110_000, 130_000);
    const narrow = rangePrice(oracle, 118_900, 119_100);
    expect(wide).toBeGreaterThan(narrow);
    expect(wide).toBeLessThanOrEqual(1);
  });
});

describe("simulate", () => {
  it("produces a coherent report for the example strategy", () => {
    const res = compile(exampleIR(), mkCtx());
    if (!res.ok) throw new Error("compile failed");
    const report = simulate(res.plan, oracle);

    // histogram probabilities sum to ~1
    const probSum = report.histogram.reduce((s, b) => s + b.prob, 0);
    expect(probSum).toBeCloseTo(1, 4);

    // ordering invariants
    expect(report.worstUsd).toBeLessThanOrEqual(report.expectedUsd);
    expect(report.expectedUsd).toBeLessThanOrEqual(report.bestUsd);
    expect(report.probProfit).toBeGreaterThanOrEqual(0);
    expect(report.probProfit).toBeLessThanOrEqual(1);
    expect(report.capitalAtRisk).toBeGreaterThanOrEqual(0);
    expect(report.capitalAtRisk).toBeLessThanOrEqual(1);
    expect(report.explanation).toContain("Expected PnL");
  });

  it("worst case for a pure binary is losing the premium", () => {
    const ir: StrategyIR = {
      ...exampleIR(),
      allocations: [
        { primitive: "binary_up", weightPct: 100, strike: { price: 119_000 } },
      ],
    };
    const res = compile(ir, mkCtx());
    if (!res.ok) throw new Error("compile failed");
    const report = simulate(res.plan, oracle);
    // worst = -cost (lose entire premium), best = face - cost > 0
    expect(report.worstUsd).toBeLessThan(0);
    expect(report.worstUsd).toBeCloseTo(-report.totalCostUsd, 6);
    expect(report.bestUsd).toBeGreaterThan(0);
  });

  it("exact cost overrides flow into payoff face", () => {
    const ir: StrategyIR = {
      ...exampleIR(),
      allocations: [
        { primitive: "binary_up", weightPct: 100, strike: { price: 119_000 } },
      ],
    };
    const res = compile(ir, mkCtx());
    if (!res.ok) throw new Error("compile failed");
    // $2 at unit cost 0.5 => $4 face => $2 net if win
    const report = simulate(res.plan, oracle, { 0: 0.5 });
    expect(report.legs[0]?.unitCost).toBe(0.5);
    expect(report.legs[0]?.payoffIfWinUsd).toBeCloseTo(4, 2);
    expect(report.bestUsd).toBeCloseTo(2, 2);
  });
});
