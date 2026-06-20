import {
  ArrowRight,
  Boxes,
  GitFork,
  LineChart,
  Repeat,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PIPELINE = [
  "Intent / *.deepforge.yaml",
  "Strategy graph",
  "Resolve strikes (live oracle)",
  "Price on-chain (devInspect)",
  "Simulate + risk",
  "PTB: mint / range / supply",
  "Forkable Strategy object",
];

const STATS = [
  { k: "100%", v: "on-chain pricing via devInspect" },
  { k: "3 → 1", v: "front-ends compile to one typed IR" },
  { k: "0", v: "mocked numbers, end to end" },
  { k: "plan / apply", v: "Terraform-style lifecycle" },
];

const MODES = [
  {
    title: "Intent",
    body: "Describe a view in plain English. It reads the live market and compiles to a typed strategy file.",
  },
  {
    title: "Visual",
    body: "Compose allocations as building blocks: ranges, binaries, PLP supply, hedges. Edit weights and strikes.",
  },
  {
    title: "DSL",
    body: "Write the canonical *.deepforge.yaml directly. The same artifact every mode compiles from.",
  },
];

const FEATURES = [
  {
    icon: LineChart,
    title: "Live on-chain pricing",
    body: "Every leg is priced by the protocol itself via devInspect. No mocked numbers, ever.",
  },
  {
    icon: Boxes,
    title: "Real simulation",
    body: "Payoff distribution derived from the live SVI volatility surface, the same model the vault prices with.",
  },
  {
    icon: ShieldCheck,
    title: "Risk engine",
    body: "Liquidity, oracle freshness, tail loss and max-loss policy scored from live vault state.",
  },
  {
    icon: GitFork,
    title: "Forkable strategy objects",
    body: "Compiled strategies become versioned, on-chain Sui objects anyone can fork and build on.",
  },
  {
    icon: Terminal,
    title: "Terraform-style CLI",
    body: "plan (dry-run, priced, simulated) and apply (executed) drive the same engine headless.",
  },
  {
    icon: Repeat,
    title: "Keeper + auto-roll",
    body: "A keeper redeems settled positions and rolls strategies into the next expiry automatically.",
  },
];

export function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <Logo size={30} className="rounded-md" />
            <span className="font-semibold tracking-tight">DeepForge</span>
            {/* <Badge variant="outline" className="ml-2 hidden gap-1.5 border-primary/30 text-muted-foreground sm:flex">
              <span className="live-dot inline-block size-1.5 rounded-full bg-primary" />
              Sui Testnet
            </Badge> */}
          </div>
          <Button onClick={onLaunch} className="gap-1.5">
            Launch app <ArrowRight className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="relative py-24 text-center">
          <div className="bg-grid pointer-events-none absolute inset-x-0 -top-10 -z-0 h-[120%]" />
          <div className="relative z-10">
            <h1 className="animate-fade-up mx-auto max-w-3xl text-balance text-5xl font-semibold leading-[1.04] tracking-tight md:text-6xl">
              Compile <span className="text-gradient-brand">intent</span> into
              programmable DeepBook Predict strategies
            </h1>
            <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
              People think in intent, not transactions. DeepForge is the compiler and
              development environment for DeepBook Predict: describe a view, and it lowers
              to validated, simulated, risk-scored, executable on-chain strategies.
            </p>
            <div className="animate-fade-up mt-9 flex items-center justify-center gap-3">
              <Button size="lg" onClick={onLaunch} className="gap-1.5 shadow-lg shadow-primary/20">
                Open Studio <ArrowRight className="size-4" />
              </Button>
              <a
                href="#how"
                className="rounded-md px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                See how it works
              </a>
            </div>

            {/* Product preview */}
            <HeroPreview />
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.k} className="bg-card px-6 py-7 text-left">
              <div className="text-2xl font-semibold text-gradient-brand">{s.k}</div>
              <div className="mt-1 text-xs leading-snug text-muted-foreground">{s.v}</div>
            </div>
          ))}
        </section>

        {/* Pipeline */}
        <section id="how" className="scroll-mt-20 border-t border-border py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            From a sentence to an on-chain position
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            One deterministic pipeline. The language model only turns English into the typed
            file; all financial logic is code.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {PIPELINE.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40">
                  <span className="font-mono text-[10px] text-primary">{i + 1}</span>
                  {step}
                </span>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground/60" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Modes */}
        <section className="border-t border-border py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Three ways to compose, one typed artifact
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {MODES.map((m, i) => (
              <Card key={m.title} className="card-hover">
                <CardHeader>
                  <div className="text-xs font-mono text-primary">0{i + 1}</div>
                  <CardTitle>{m.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{m.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Built as infrastructure, not a wrapper
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="card-hover">
                <CardHeader>
                  <div className="flex size-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                    <f.icon className="size-5 text-primary" />
                  </div>
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{f.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Proof */}
        <section className="border-t border-border py-20">
          <div className="grid grid-cols-1 gap-8 rounded-2xl border border-border bg-card p-8 md:grid-cols-3 md:p-10">
            <Proof k="Live integration" v="Reads real oracles + the SVI surface and prices trades via devInspect against the deployed Predict contract." />
            <Proof k="Real execution" v="Signs and lands predict::mint / mint_range / supply on testnet, with a forkable Strategy object minted per strategy." />
            <Proof k="Nothing mocked" v="Cost from on-chain devInspect, distribution from the protocol's price function, risk from live vault state." />
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Open the Studio</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Connect a Sui testnet wallet, describe a view, and watch it compile, price, and
            execute live.
          </p>
          <Button size="lg" onClick={onLaunch} className="mt-8 gap-1.5 shadow-lg shadow-primary/20">
            Launch app <ArrowRight className="size-4" />
          </Button>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6">
          <Logo size={18} className="rounded" />
          DeepForge — the programming environment for DeepBook Predict. Sui Testnet.
        </div>
      </footer>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="animate-fade-up animate-float mx-auto mt-16 max-w-3xl">
      <div className="glow-ring overflow-hidden rounded-xl border border-border bg-card text-left">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-destructive/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-primary/70" />
          <span className="ml-2 font-mono text-[11px] text-muted-foreground">
            btc-range.deepforge.yaml
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-primary">
            <span className="live-dot inline-block size-1.5 rounded-full bg-primary" />
            compiled live
          </span>
        </div>
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {/* Intent / DSL side */}
          <div className="bg-card p-4">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              intent
            </div>
            <p className="mb-3 text-sm">
              “BTC stays in a tight range for the next hour, small size, cap loss at 20%.”
            </p>
            <pre className="overflow-hidden rounded-md bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`name: BTC range harvest
asset: BTC
capital: { amount: 2, quote: DUSDC }
view: { kind: range, bias: neutral }
risk: { maxLossPct: 20 }
allocations:
  - { primitive: range, weightPct: 60 }
  - { primitive: binary_up, weightPct: 40 }`}
            </pre>
          </div>
          {/* Result side */}
          <div className="bg-card p-4">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              compiled · priced · simulated
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Metric k="P(profit)" v="62%" tone="good" />
              <Metric k="expected" v="+$0.34" tone="good" />
              <Metric k="worst" v="−$0.40" tone="bad" />
              <Metric k="risk" v="74/100" />
              <Metric k="cost" v="$1.96" />
              <Metric k="max-loss" v="OK" tone="good" />
            </div>
            <div className="mt-3 flex h-16 items-end gap-[3px]">
              {[3, 6, 10, 16, 22, 28, 30, 26, 19, 12, 7, 4].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${(h / 30) * 100}%`,
                    background: i >= 3 && i <= 9 ? "var(--chart-2)" : "var(--chart-4)",
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              payoff distribution from the live SVI surface
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div
        className={`font-mono text-sm font-semibold ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {v}
      </div>
    </div>
  );
}

function Proof({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
        <span className="size-1.5 rounded-full bg-primary" />
        {k}
      </div>
      <div className="text-sm leading-relaxed text-muted-foreground">{v}</div>
    </div>
  );
}
