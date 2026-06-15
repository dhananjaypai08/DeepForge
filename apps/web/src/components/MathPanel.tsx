import type { LogicalPlan } from "@deepforge/compiler";
import type { OracleInfo } from "@deepforge/config/market";
import type { ExecutionPlan } from "@deepforge/predict-sdk";
import { binaryUpPrice, sviTotalVariance } from "@deepforge/simulator";

/**
 * Surfaces the live volatility surface and the exact pricing math the protocol
 * uses, so the "magic" is visible: k = ln(K/F), w(k) = SVI total variance,
 * d2 = (-k - w/2)/√w, model prob = Φ(d2), vs the live devInspect ask.
 */
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
  const wAtm = Math.max(0, sviTotalVariance(oracle.svi, 0));
  const sigmaAtm = Math.sqrt(wAtm); // ~1σ log-move to expiry
  const tteMin = Math.round((plan.expiryMs - Date.now()) / 60000);

  return (
    <div className="panel">
      <h3>Under the hood — live volatility surface &amp; pricing</h3>

      <div className="surface">
        <span className="muted small">oracle {oracle.id.slice(0, 10)}…</span>
        <Kv k="forward" v={`$${F.toFixed(0)}`} />
        <Kv k="spot" v={`$${oracle.spot.toFixed(0)}`} />
        <Kv k="expiry" v={`${tteMin}m`} />
        <Kv k="ATM vol (√w)" v={`${(sigmaAtm * 100).toFixed(2)}%`} />
      </div>
      <div className="svi small muted">
        SVI a={oracle.svi.a.toExponential(2)} b={oracle.svi.b.toExponential(2)} ρ=
        {oracle.svi.rho.toFixed(3)} m={oracle.svi.m.toExponential(2)} σ=
        {oracle.svi.sigma.toExponential(2)}
        &nbsp;→&nbsp;w(k) = a + b(ρ(k−m) + √((k−m)²+σ²))
      </div>

      <ProbCurve oracle={oracle} plan={plan} />

      <table className="tbl math-tbl">
        <thead>
          <tr>
            <th>leg</th>
            <th className="num">k=ln(K/F)</th>
            <th className="num">w(k)</th>
            <th className="num">d2</th>
            <th className="num">model P</th>
            <th className="num">live ask</th>
          </tr>
        </thead>
        <tbody>
          {plan.legs.map((leg, i) => {
            const rows =
              leg.kind === "binary"
                ? [{ label: leg.label, K: leg.strikeUsd, up: leg.direction === 0 }]
                : leg.kind === "range"
                  ? [
                      { label: `≥ $${leg.lowerUsd}`, K: leg.lowerUsd, up: true },
                      { label: `≥ $${leg.upperUsd}`, K: leg.upperUsd, up: true },
                    ]
                  : [];
            return rows.map((r, j) => {
              const k = Math.log(r.K / F);
              const w = sviTotalVariance(oracle.svi, k);
              const d2 = (-k - w / 2) / Math.sqrt(Math.max(w, 1e-12));
              const pUp = binaryUpPrice(oracle, r.K);
              const p = r.up ? pUp : 1 - pUp;
              const ask = j === 0 ? execPlan.unitCosts[i] : undefined;
              return (
                <tr key={`${i}-${j}`}>
                  <td>{r.label}</td>
                  <td className="num">{k.toFixed(4)}</td>
                  <td className="num">{w.toExponential(2)}</td>
                  <td className="num">{d2.toFixed(3)}</td>
                  <td className="num">{(p * 100).toFixed(1)}%</td>
                  <td className="num">
                    {ask !== undefined ? `${(ask * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
      <div className="muted small">
        Model P comes from the live SVI surface; “live ask” is the exact price the
        protocol returned via devInspect. The gap is the protocol’s spread.
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <span className="kv">
      <span className="muted small">{k}</span>
      <b>{v}</b>
    </span>
  );
}

/** Risk-neutral CDF P(S_T > K) across strikes, from the live price function. */
function ProbCurve({ oracle, plan }: { oracle: OracleInfo; plan: LogicalPlan }) {
  const F = oracle.forward;
  const w = Math.max(1e-9, sviTotalVariance(oracle.svi, 0));
  const sd = Math.sqrt(w);
  const lo = F * Math.exp(-4 * sd);
  const hi = F * Math.exp(4 * sd);
  const W = 320;
  const H = 110;
  const N = 80;
  const x = (K: number) => ((K - lo) / (hi - lo)) * W;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const K = lo + ((hi - lo) * i) / N;
    const p = binaryUpPrice(oracle, K); // P(S>K)
    pts.push(`${x(K).toFixed(1)},${(H - p * H).toFixed(1)}`);
  }
  const strikes: { K: number; c: string }[] = [];
  for (const leg of plan.legs) {
    if (leg.kind === "binary") strikes.push({ K: leg.strikeUsd, c: "#f59e0b" });
    else if (leg.kind === "range") {
      strikes.push({ K: leg.lowerUsd, c: "#38bdf8" });
      strikes.push({ K: leg.upperUsd, c: "#38bdf8" });
    }
  }
  return (
    <svg className="probcurve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line x1={x(F)} y1={0} x2={x(F)} y2={H} stroke="#445" strokeDasharray="3 3" />
      <polyline points={pts.join(" ")} fill="none" stroke="#34e3c4" strokeWidth={2} />
      {strikes.map((s, i) =>
        s.K > lo && s.K < hi ? (
          <line key={i} x1={x(s.K)} y1={0} x2={x(s.K)} y2={H} stroke={s.c} strokeWidth={1.5} />
        ) : null,
      )}
    </svg>
  );
}
