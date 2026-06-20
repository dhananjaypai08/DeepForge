import { compile, type LogicalPlan, type StrategyGraph } from "@deepforge/compiler";
import { simulate, type SimulationReport } from "@deepforge/simulator";
import { assessRisk, type RiskReport, type VaultState } from "@deepforge/risk";
import type { StrategyIR } from "@deepforge/ir";
import type { OracleInfo } from "@deepforge/config/market";
import {
  buildExecutionPlan,
  buildMarketContext,
  getVaultState,
  makeContext,
  ZERO_ADDRESS,
  type ExecutionPlan,
} from "@deepforge/predict-sdk";

export interface PipelineResult {
  plan: LogicalPlan;
  graph: StrategyGraph;
  execPlan: ExecutionPlan;
  oracle: OracleInfo;
  sim: SimulationReport;
  risk: RiskReport;
  vault?: VaultState;
}

export type StageKey = "market" | "compile" | "price" | "simulate" | "risk";
export interface StageEvent {
  key: StageKey;
  label: string;
  status: "running" | "done" | "error";
  detail?: string;
}
export type OnStage = (e: StageEvent) => void;

export const PIPELINE_STAGES: { key: StageKey; label: string }[] = [
  { key: "market", label: "Read live market (on-chain oracles)" },
  { key: "compile", label: "Compile intent → strategy graph" },
  { key: "price", label: "Price every leg on-chain (devInspect, no gas)" },
  { key: "simulate", label: "Simulate payoff distribution" },
  { key: "risk", label: "Assess risk vs live vault state" },
];

/** Read the live BTC forward/spot to ground intent strike selection. */
export async function fetchSpotHint(): Promise<number | undefined> {
  try {
    const ctx = makeContext({ network: "testnet" });
    const market = await buildMarketContext(ctx, { maxOracles: 8 });
    const active = market.oracles.find((o) => o.status === 1) ?? market.oracles[0];
    return active?.forward ?? active?.spot;
  } catch {
    return undefined;
  }
}

/** Run the full compile -> quantize -> simulate -> risk pipeline in-browser. */
export async function runPipeline(
  ir: StrategyIR,
  opts: { sender?: string; oracleId?: string; onStage?: OnStage } = {},
): Promise<PipelineResult> {
  const on = opts.onStage ?? (() => {});
  const stage = async <T>(
    key: StageKey,
    label: string,
    fn: () => Promise<T> | T,
    detail: (r: T) => string,
  ): Promise<T> => {
    on({ key, label, status: "running" });
    try {
      const r = await fn();
      on({ key, label, status: "done", detail: detail(r) });
      return r;
    } catch (e) {
      on({ key, label, status: "error", detail: (e as Error).message });
      throw e;
    }
  };

  const ctx = makeContext({ network: "testnet" });

  const market = await stage(
    "market",
    "Read live market (on-chain oracles)",
    () => buildMarketContext(ctx, { oracleIds: opts.oracleId ? [opts.oracleId] : undefined }),
    (m) => `read ${m.oracles.length} live oracles`,
  );

  const compiled = await stage(
    "compile",
    "Compile intent → strategy graph",
    () => compile(ir, market),
    (c) => (c.ok ? `oracle ${c.plan.oracleId.slice(0, 8)}… · ${c.plan.legs.length} legs` : "failed"),
  );
  if (!compiled.ok) {
    throw new Error(
      compiled.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; "),
    );
  }

  const execPlan = await stage(
    "price",
    "Price every leg on-chain (devInspect, no gas)",
    () => buildExecutionPlan(ctx, compiled.plan, { sender: opts.sender ?? ZERO_ADDRESS }),
    (p) => `${p.steps.length} legs priced · ${(Number(p.totalQuoteBaseUnits) / 1e6).toFixed(2)} dUSDC`,
  );

  const oracle = market.oracles.find((o) => o.id === compiled.plan.oracleId)!;

  const sim = await stage(
    "simulate",
    "Simulate payoff distribution",
    () => simulate(compiled.plan, oracle, execPlan.unitCosts),
    (s) => `${(s.probProfit * 100).toFixed(0)}% P(profit) · best +$${s.bestUsd.toFixed(2)}`,
  );

  let vault: VaultState | undefined;
  const risk = await stage(
    "risk",
    "Assess risk vs live vault state",
    async () => {
      try {
        vault = await getVaultState(ctx);
      } catch {
        vault = undefined;
      }
      return assessRisk({
        plan: compiled.plan,
        sim,
        oracle,
        nowMs: market.nowMs,
        vault,
        maxLossPct: ir.risk.maxLossPct,
      });
    },
    (r) => `overall ${Math.round(r.overall)}/100`,
  );

  return { plan: compiled.plan, graph: compiled.graph, execPlan, oracle, sim, risk, vault };
}
