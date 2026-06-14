import { describe, it, expect } from "vitest";
import { ORACLE_STATUS } from "@deepforge/config";
import type { OracleInfo } from "@deepforge/config/market";
import { compile } from "@deepforge/compiler";
import { simulate } from "@deepforge/simulator";
import { exampleIR } from "@deepforge/ir";
import { assessRisk, type VaultState } from "./index.js";

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
const vault: VaultState = {
  valueUsd: 1_000_000,
  totalMtmUsd: 200_000,
  totalMaxPayoutUsd: 800_000,
  availableWithdrawalUsd: 500_000,
};

function build() {
  const res = compile(exampleIR(), { nowMs: NOW, oracles: [oracle] });
  if (!res.ok) throw new Error("compile failed");
  const sim = simulate(res.plan, oracle);
  return { plan: res.plan, sim };
}

describe("assessRisk", () => {
  it("produces all scores within 0..100", () => {
    const { plan, sim } = build();
    const r = assessRisk({ plan, sim, oracle, nowMs: NOW, vault, maxLossPct: 10 });
    for (const s of [r.risk, r.liquidity, r.oracle, r.volatility, r.settlement, r.tail]) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
    expect(r.overallU64).toBe(BigInt(Math.round(r.overall)));
  });

  it("fresh active oracle scores high; stale scores low", () => {
    const { plan, sim } = build();
    const fresh = assessRisk({ plan, sim, oracle, nowMs: NOW, vault, maxLossPct: 10 });
    const stale = assessRisk({
      plan,
      sim,
      oracle,
      nowMs: NOW + 60_000, // 60s > 30s threshold
      vault,
      maxLossPct: 10,
    });
    expect(fresh.oracle.score).toBeGreaterThan(stale.oracle.score);
    expect(stale.oracle.score).toBe(0);
  });

  it("flags max-loss breach", () => {
    const { plan, sim } = build();
    const tight = assessRisk({ plan, sim, oracle, nowMs: NOW, vault, maxLossPct: 0 });
    expect(tight.maxLossRespected).toBe(false);
  });

  it("inactive oracle => oracle score 0", () => {
    const { plan, sim } = build();
    const r = assessRisk({
      plan,
      sim,
      oracle: { ...oracle, status: ORACLE_STATUS.SETTLED },
      nowMs: NOW,
      vault,
      maxLossPct: 10,
    });
    expect(r.oracle.score).toBe(0);
  });
});
