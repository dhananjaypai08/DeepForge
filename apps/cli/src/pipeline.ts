import { readFileSync } from "node:fs";
import { parseDeepforgeFile, type StrategyIR } from "@deepforge/ir";
import { compile, type CompileResult, type LogicalPlan } from "@deepforge/compiler";
import { simulate, type SimulationReport } from "@deepforge/simulator";
import { assessRisk, type RiskReport, type VaultState } from "@deepforge/risk";
import type { OracleInfo } from "@deepforge/config/market";
import {
  buildExecutionPlan,
  buildMarketContext,
  getVaultState,
  makeContext,
  ZERO_ADDRESS,
  type DeepforgeContext,
  type ExecutionPlan,
} from "@deepforge/predict-sdk";
import type { SuiNetwork } from "@deepforge/config";

export interface PreparedPlan {
  ir: StrategyIR;
  ctx: DeepforgeContext;
  plan: LogicalPlan;
  execPlan: ExecutionPlan;
  oracle: OracleInfo;
  sim: SimulationReport;
  risk: RiskReport;
  vault?: VaultState;
}

export interface PrepareOptions {
  network?: SuiNetwork;
  oracleId?: string;
  sender?: string;
}

/**
 * The full plan pipeline shared by `plan`, `apply`, and `publish`:
 * parse -> live market context -> compile -> quantize via devInspect ->
 * simulate -> assess risk. No gas is spent here.
 */
export async function preparePlan(
  file: string,
  opts: PrepareOptions = {},
): Promise<PreparedPlan> {
  const ir = parseDeepforgeFile(readFileSync(file, "utf8"));
  const ctx = makeContext({ network: opts.network ?? "testnet" });
  const marketCtx = await buildMarketContext(ctx, {
    oracleIds: opts.oracleId ? [opts.oracleId] : undefined,
  });
  const compiled: CompileResult = compile(ir, marketCtx);
  if (!compiled.ok) {
    const msg = compiled.errors
      .map((e) => `  - ${e.path || "(root)"}: ${e.message}`)
      .join("\n");
    throw new Error(`compile failed:\n${msg}`);
  }
  const execPlan = await buildExecutionPlan(ctx, compiled.plan, {
    sender: opts.sender ?? ZERO_ADDRESS,
  });
  const oracle = marketCtx.oracles.find((o) => o.id === compiled.plan.oracleId);
  if (!oracle) throw new Error("internal: selected oracle missing from context");
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
    nowMs: marketCtx.nowMs,
    vault,
    maxLossPct: ir.risk.maxLossPct,
  });

  return { ir, ctx, plan: compiled.plan, execPlan, oracle, sim, risk, vault };
}
