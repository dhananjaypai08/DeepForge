import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LogicalPlan } from "@deepforge/compiler";
import type { OracleInfo } from "@deepforge/config/market";
import type { ExecutionPlan } from "@deepforge/predict-sdk";
import { binaryUpPrice, sviTotalVariance } from "@deepforge/simulator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function MathPanel({
  plan,
  oracle,
  execPlan,
}: {
  plan: LogicalPlan;
  oracle: OracleInfo;
  execPlan: ExecutionPlan;
}) {
  const F = oracle.forward;
  const sigmaAtm = Math.sqrt(Math.max(0, sviTotalVariance(oracle.svi, 0)));
  const tteMin = Math.round((plan.expiryMs - Date.now()) / 60000);

  // Probability curve P(S_T > K) across strikes, from the live price function.
  const sd = Math.max(1e-9, sigmaAtm);
  const lo = F * Math.exp(-4 * sd);
  const hi = F * Math.exp(4 * sd);
  const curve = Array.from({ length: 60 }, (_, i) => {
    const K = lo + ((hi - lo) * i) / 59;
    return { K, p: binaryUpPrice(oracle, K) };
  });
  const strikeMarks: { K: number; c: string }[] = [];
  for (const leg of plan.legs) {
    if (leg.kind === "binary") strikeMarks.push({ K: leg.strikeUsd, c: "var(--chart-3)" });
    else if (leg.kind === "range") {
      strikeMarks.push({ K: leg.lowerUsd, c: "var(--chart-1)" });
      strikeMarks.push({ K: leg.upperUsd, c: "var(--chart-1)" });
    }
  }

  const rows = plan.legs.flatMap((leg, i) => {
    const items =
      leg.kind === "binary"
        ? [{ label: leg.label, K: leg.strikeUsd, up: leg.direction === 0 }]
        : leg.kind === "range"
          ? [
              { label: `≥ $${leg.lowerUsd}`, K: leg.lowerUsd, up: true },
              { label: `≥ $${leg.upperUsd}`, K: leg.upperUsd, up: true },
            ]
          : [];
    return items.map((r, j) => {
      const k = Math.log(r.K / F);
      const w = sviTotalVariance(oracle.svi, k);
      const d2 = (-k - w / 2) / Math.sqrt(Math.max(w, 1e-12));
      const pUp = binaryUpPrice(oracle, r.K);
      const p = r.up ? pUp : 1 - pUp;
      const ask = j === 0 ? execPlan.unitCosts[i] : undefined;
      return { key: `${i}-${j}`, label: r.label, k, w, d2, p, ask };
    });
  });

  const KV = ({ k, v }: { k: string; v: string }) => (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="font-mono text-sm">{v}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Under the hood - live volatility surface &amp; pricing</CardTitle>
        <span className="font-mono text-[11px] text-muted-foreground">
          oracle {oracle.id.slice(0, 12)}…
        </span>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex flex-wrap gap-5">
          <KV k="forward" v={`$${F.toFixed(0)}`} />
          <KV k="spot" v={`$${oracle.spot.toFixed(0)}`} />
          <KV k="expiry" v={`${tteMin}m`} />
          <KV k="ATM vol (√w)" v={`${(sigmaAtm * 100).toFixed(2)}%`} />
        </div>
        <p className="mb-2 break-words font-mono text-[11px] text-muted-foreground">
          SVI a={oracle.svi.a.toExponential(2)} b={oracle.svi.b.toExponential(2)} ρ=
          {oracle.svi.rho.toFixed(3)} m={oracle.svi.m.toExponential(2)} σ=
          {oracle.svi.sigma.toExponential(2)} → w(k)=a+b(ρ(k−m)+√((k−m)²+σ²))
        </p>

        <div className="h-32 w-full rounded-md bg-secondary/30 p-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curve} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="K"
                type="number"
                domain={[lo, hi]}
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                minTickGap={40}
              />
              <YAxis hide domain={[0, 1]} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) => [`${(Number(v) * 100).toFixed(0)}%`, "P(S>K)"]}
                labelFormatter={(v) => `K $${Math.round(Number(v))}`}
              />
              <ReferenceLine x={F} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
              {strikeMarks.map((s, i) => (
                <ReferenceLine key={i} x={s.K} stroke={s.c} />
              ))}
              <Line
                type="monotone"
                dataKey="p"
                stroke="var(--chart-2)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>leg</TableHead>
              <TableHead className="text-right">k=ln(K/F)</TableHead>
              <TableHead className="text-right">w(k)</TableHead>
              <TableHead className="text-right">d2</TableHead>
              <TableHead className="text-right">model P</TableHead>
              <TableHead className="text-right">live ask</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="text-[13px]">{r.label}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.k.toFixed(4)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.w.toExponential(2)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{r.d2.toFixed(3)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{(r.p * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.ask !== undefined ? `${(r.ask * 100).toFixed(1)}%` : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">
          Model P comes from the live SVI surface; “live ask” is the exact price the protocol
          returned via devInspect. The gap is the protocol’s spread.
        </p>
      </CardContent>
    </Card>
  );
}
