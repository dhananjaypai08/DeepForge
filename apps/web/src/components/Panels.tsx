import { baseUnitsToDollars } from "@deepforge/config/market";
import type { SimulationReport } from "@deepforge/simulator";
import type { RiskReport } from "@deepforge/risk";
import type { ExecutionPlan } from "@deepforge/predict-sdk";

const money = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;
const usd = (b: string | bigint) => `$${baseUnitsToDollars(BigInt(b)).toFixed(2)}`;

export function ActionsPanel({ plan }: { plan: ExecutionPlan }) {
  return (
    <div className="panel">
      <h3>Execution plan (priced via devInspect — no gas)</h3>
      <table className="tbl">
        <tbody>
          {plan.steps.map((s, i) => (
            <tr key={i}>
              <td>
                {s.op === "mint"
                  ? `MINT ${s.direction === 0 ? "UP" : "DOWN"} @ $${Number(s.strikeScaled) / 1e9}`
                  : s.op === "mint_range"
                    ? `RANGE $${Number(s.lowerScaled) / 1e9}–$${Number(s.higherScaled) / 1e9}`
                    : "SUPPLY PLP"}
              </td>
              <td className="num">
                {s.op === "supply" ? usd(s.amountBaseUnits) : usd(s.costBaseUnits)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted">
        deposit {usd(plan.depositBaseUnits)} · supply {usd(plan.supplyBaseUnits)} · total{" "}
        {usd(plan.totalQuoteBaseUnits)} dUSDC
      </div>
    </div>
  );
}

export function SimPanel({ sim }: { sim: SimulationReport }) {
  const max = Math.max(...sim.histogram.map((b) => b.prob), 1e-9);
  return (
    <div className="panel">
      <h3>Simulation</h3>
      <div className="stat-row">
        <Stat label="best" value={money(sim.bestUsd)} good />
        <Stat label="expected" value={money(sim.expectedUsd)} />
        <Stat label="worst" value={money(sim.worstUsd)} bad />
        <Stat label="P(profit)" value={`${(sim.probProfit * 100).toFixed(0)}%`} />
        <Stat
          label="capital@risk"
          value={`${(sim.capitalAtRisk * 100).toFixed(0)}%`}
        />
      </div>
      <div className="hist">
        {sim.histogram
          .filter((_, i) => i % 3 === 0)
          .map((b, i) => (
            <div
              key={i}
              className="hist-bar"
              title={`$${b.centerUsd.toFixed(0)} · ${(b.prob * 100).toFixed(1)}% · ${money(b.pnlUsd)}`}
              style={{
                height: `${(b.prob / max) * 100}%`,
                background: b.pnlUsd >= 0 ? "#34d399" : "#fb7185",
              }}
            />
          ))}
      </div>
      <p className="muted">{sim.explanation}</p>
    </div>
  );
}

export function RiskPanel({ risk }: { risk: RiskReport }) {
  const rows: [string, { score: number; rationale: string }][] = [
    ["Risk", risk.risk],
    ["Liquidity", risk.liquidity],
    ["Oracle", risk.oracle],
    ["Volatility", risk.volatility],
    ["Settlement", risk.settlement],
    ["Tail", risk.tail],
  ];
  return (
    <div className="panel">
      <h3>
        Risk dashboard — overall {Math.round(risk.overall)}/100{" "}
        <span className={risk.maxLossRespected ? "ok" : "breach"}>
          {risk.maxLossRespected ? "max-loss OK" : "MAX-LOSS BREACH"}
        </span>
      </h3>
      {rows.map(([label, s]) => (
        <div className="risk-row" key={label}>
          <span className="risk-label">{label}</span>
          <span className="risk-meter">
            <span
              className="risk-fill"
              style={{
                width: `${s.score}%`,
                background: s.score > 66 ? "#34d399" : s.score > 33 ? "#f59e0b" : "#fb7185",
              }}
            />
          </span>
          <span className="risk-num">{Math.round(s.score)}</span>
          <span className="risk-why muted">{s.rationale}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  good,
  bad,
}: {
  label: string;
  value: string;
  good?: boolean;
  bad?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${good ? "good" : ""} ${bad ? "bad" : ""}`}>{value}</div>
    </div>
  );
}
