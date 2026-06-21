import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { baseUnitsToDollars } from "@deepforge/config/market";
import type { SimulationReport } from "@deepforge/simulator";
import type { RiskReport } from "@deepforge/risk";
import type { ExecutionPlan } from "@deepforge/predict-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

const money = (x: number) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;
const usd = (b: string | bigint) => `$${baseUnitsToDollars(BigInt(b)).toFixed(2)}`;

export function ActionsPanel({ plan }: { plan: ExecutionPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Execution plan</CardTitle>
        <span className="text-xs text-muted-foreground">priced via devInspect - no gas</span>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {plan.steps.map((s, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">
                  {s.op === "mint"
                    ? `MINT ${s.direction === 0 ? "UP" : "DOWN"} @ $${Number(s.strikeScaled) / 1e9}`
                    : s.op === "mint_range"
                      ? `RANGE $${Number(s.lowerScaled) / 1e9}–$${Number(s.higherScaled) / 1e9}`
                      : "SUPPLY PLP"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {s.op === "supply" ? usd(s.amountBaseUnits) : usd(s.costBaseUnits)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-3 flex flex-col gap-1 rounded-md border border-border bg-secondary/30 p-3 text-xs">
          <Row label="Positions cost (exact quote)" value={`${usd(plan.legsCostBaseUnits)} dUSDC`} />
          {BigInt(plan.supplyBaseUnits) > 0n && (
            <Row label="PLP supply" value={`${usd(plan.supplyBaseUnits)} dUSDC`} />
          )}
          <Row
            label={`Slippage buffer (+${(plan.slippageBps / 100).toFixed(0)}%)`}
            value={`${usd(
              (BigInt(plan.depositBaseUnits) - BigInt(plan.legsCostBaseUnits)).toString(),
            )} dUSDC`}
          />
          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
            <span className="font-semibold text-foreground">You sign / deposit</span>
            <span className="font-mono text-base font-bold text-primary">
              {usd(plan.totalQuoteBaseUnits)} dUSDC
            </span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Mint pulls only the exact cost; the buffer absorbs price movement between this on-chain
          quote and execution. Any unused buffer stays in your PredictManager and is withdrawable.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`font-mono text-lg font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

export function SimPanel({ sim }: { sim: SimulationReport }) {
  const data = sim.histogram
    .filter((_, i) => i % 2 === 0)
    .map((b) => ({ x: b.centerUsd, prob: b.prob, pnl: b.pnlUsd }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Simulation</CardTitle>
        <span className="text-xs text-muted-foreground">
          model distribution from the live SVI surface
        </span>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-5">
          <Stat label="best" value={money(sim.bestUsd)} tone="good" />
          <Stat label="expected" value={money(sim.expectedUsd)} />
          <Stat label="worst" value={money(sim.worstUsd)} tone="bad" />
          <Stat label="P(win)" value={`${(sim.probNoLoss * 100).toFixed(0)}%`} />
          <Stat label="P(profit)" value={`${(sim.probProfit * 100).toFixed(0)}%`} />
          <Stat label="capital@risk" value={`${(sim.capitalAtRisk * 100).toFixed(0)}%`} />
        </div>
        {sim.noEdge && (
          <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
            No edge: this outcome is near-certain at the current volatility, so it is priced at
            roughly fair value - you win ~{(sim.probNoLoss * 100).toFixed(0)}% of the time but only
            break even. Tighten the range (smaller width) or add a directional leg for real upside.
          </div>
        )}
        <div className="h-28 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="x"
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(_v, _n, p) => [money(p.payload.pnl), "P&L"]}
                labelFormatter={(v) => `BTC $${Math.round(Number(v))}`}
              />
              <Bar dataKey="prob" radius={[2, 2, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.pnl >= 0 ? "var(--chart-2)" : "var(--chart-4)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{sim.explanation}</p>
      </CardContent>
    </Card>
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
  const color = (s: number) =>
    s > 66 ? "var(--chart-2)" : s > 33 ? "var(--chart-3)" : "var(--chart-4)";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          Risk dashboard
          <span className="text-muted-foreground">overall {Math.round(risk.overall)}/100</span>
          <span
            className={`ml-auto text-xs font-semibold ${risk.maxLossRespected ? "text-success" : "text-destructive"}`}
          >
            {risk.maxLossRespected ? "max-loss OK" : "MAX-LOSS BREACH"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map(([label, s]) => (
          <div key={label} className="grid grid-cols-[80px_100px_30px_1fr] items-center gap-3">
            <span className="text-[13px]">{label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full"
                style={{ width: `${s.score}%`, background: color(s.score) }}
              />
            </span>
            <span className="text-right font-mono text-xs">{Math.round(s.score)}</span>
            <span className="truncate text-[11px] text-muted-foreground">{s.rationale}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
