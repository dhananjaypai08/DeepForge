import { baseUnitsToDollars } from "@deepforge/config/market";
import type { LogicalPlan } from "@deepforge/compiler";
import type { SimulationReport } from "@deepforge/simulator";
import type { RiskReport } from "@deepforge/risk";
import type { ExecutionPlan } from "@deepforge/predict-sdk";

const money = (x: number) => `${x >= 0 ? "+" : "-"}$${Math.abs(x).toFixed(2)}`;
const usd = (x: number) => `$${x.toFixed(2)}`;

export function renderActions(plan: ExecutionPlan): string {
  const lines = ["Actions (resolved against live oracle, priced via devInspect):"];
  for (const s of plan.steps) {
    if (s.op === "mint") {
      lines.push(
        `  • MINT ${s.direction === 0 ? "UP" : "DOWN"} @ strike ${Number(s.strikeScaled) / 1e9} ` +
          `qty=${usd(baseUnitsToDollars(BigInt(s.quantity)))} face  cost=${usd(
            baseUnitsToDollars(BigInt(s.costBaseUnits)),
          )}`,
      );
    } else if (s.op === "mint_range") {
      lines.push(
        `  • RANGE $${Number(s.lowerScaled) / 1e9}–$${Number(s.higherScaled) / 1e9} ` +
          `qty=${usd(baseUnitsToDollars(BigInt(s.quantity)))} face  cost=${usd(
            baseUnitsToDollars(BigInt(s.costBaseUnits)),
          )}`,
      );
    } else {
      lines.push(`  • SUPPLY PLP ${usd(baseUnitsToDollars(BigInt(s.amountBaseUnits)))}`);
    }
  }
  lines.push(
    `  deposit=${usd(baseUnitsToDollars(BigInt(plan.depositBaseUnits)))} ` +
      `supply=${usd(baseUnitsToDollars(BigInt(plan.supplyBaseUnits)))} ` +
      `total=${usd(baseUnitsToDollars(BigInt(plan.totalQuoteBaseUnits)))} dUSDC`,
  );
  return lines.join("\n");
}

export function renderSim(sim: SimulationReport): string {
  return [
    "Simulation:",
    `  best     ${money(sim.bestUsd)}`,
    `  expected ${money(sim.expectedUsd)}`,
    `  worst    ${money(sim.worstUsd)}`,
    `  P(profit) ${(sim.probProfit * 100).toFixed(0)}%   capital-at-risk ${(
      sim.capitalAtRisk * 100
    ).toFixed(0)}%`,
    `  ${sim.explanation}`,
  ].join("\n");
}

function bar(score: number): string {
  const n = Math.round(score / 10);
  return "█".repeat(n) + "·".repeat(10 - n);
}

export function renderRisk(risk: RiskReport): string {
  const row = (label: string, s: { score: number; rationale: string }) =>
    `  ${label.padEnd(12)} ${bar(s.score)} ${String(Math.round(s.score)).padStart(3)}  ${s.rationale}`;
  return [
    `Risk dashboard (overall ${Math.round(risk.overall)}/100):`,
    row("risk", risk.risk),
    row("liquidity", risk.liquidity),
    row("oracle", risk.oracle),
    row("volatility", risk.volatility),
    row("settlement", risk.settlement),
    row("tail", risk.tail),
    `  max-loss policy ${risk.maxLossPct}% — worst case ${risk.worstCaseLossPct.toFixed(
      0,
    )}% → ${risk.maxLossRespected ? "OK" : "BREACH"}`,
  ].join("\n");
}

export function renderPlanHeader(plan: LogicalPlan): string {
  return [
    `Strategy: ${plan.name}`,
    `  oracle ${plan.oracleId.slice(0, 12)}…  expiry in ${Math.round(
      (plan.expiryMs - Date.now()) / 60000,
    )}m  capital ${usd(baseUnitsToDollars(plan.capitalBaseUnits))}`,
    plan.warnings.length ? `  warnings: ${plan.warnings.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
