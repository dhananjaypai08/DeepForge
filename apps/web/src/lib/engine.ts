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

/** Run the full compile -> quantize -> simulate -> risk pipeline in-browser. */
export async function runPipeline(
  ir: StrategyIR,
  opts: { sender?: string; oracleId?: string } = {},
): Promise<PipelineResult> {
  const ctx = makeContext({ network: "testnet" });
  const market = await buildMarketContext(ctx, {
    oracleIds: opts.oracleId ? [opts.oracleId] : undefined,
  });
  const compiled = compile(ir, market);
  if (!compiled.ok) {
    throw new Error(
      compiled.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; "),
    );
  }
  const execPlan = await buildExecutionPlan(ctx, compiled.plan, {
    sender: opts.sender ?? ZERO_ADDRESS,
  });
  const oracle = market.oracles.find((o) => o.id === compiled.plan.oracleId)!;
  const sim = simulate(compiled.plan, oracle, execPlan.unitCosts);
  let vault: VaultState | undefined;
  try {
    vault = await getVaultState(ctx);
  } catch {
    vault = undefined;
  }
  const risk = assessRisk({
    plan: compiled.plan,
    sim,
    oracle,
    nowMs: market.nowMs,
    vault,
    maxLossPct: ir.risk.maxLossPct,
  });
  return { plan: compiled.plan, graph: compiled.graph, execPlan, oracle, sim, risk, vault };
}
