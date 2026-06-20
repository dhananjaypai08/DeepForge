import {
  ArrowRight,
  Boxes,
  GitFork,
  LineChart,
  Repeat,
  ShieldCheck,
  Terminal,
} from "lucide-react";
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
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
              DF
            </div>
            <span className="font-semibold">DeepForge</span>
          </div>
          <Button onClick={onLaunch} className="gap-1.5">
            Launch app <ArrowRight className="size-4" />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="py-20 text-center">
          <Badge variant="outline" className="mb-5">
            Live on Sui Testnet
          </Badge>
          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight">
            Compile intent into programmable DeepBook Predict strategies
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            People think in intent, not transactions. DeepForge is the compiler and development
            environment for DeepBook Predict: describe a view, and it lowers to validated,
            simulated, risk-scored, executable on-chain strategies.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" onClick={onLaunch} className="gap-1.5">
              Open Studio <ArrowRight className="size-4" />
            </Button>
            <a href="#how" className="text-sm text-muted-foreground hover:text-foreground">
              See how it works
            </a>
          </div>
        </section>

        {/* Pipeline */}
        <section id="how" className="border-t border-border py-16">
          <h2 className="text-center text-2xl font-semibold">From a sentence to an on-chain position</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            One deterministic pipeline. The language model only turns English into the typed file;
            all financial logic is code.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {PIPELINE.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                  {step}
                </span>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Modes */}
        <section className="border-t border-border py-16">
          <h2 className="text-center text-2xl font-semibold">Three ways to compose</h2>
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            {MODES.map((m) => (
              <Card key={m.title}>
                <CardHeader>
                  <CardTitle>{m.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{m.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border py-16">
          <h2 className="text-center text-2xl font-semibold">Built as infrastructure, not a wrapper</h2>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardHeader>
                  <f.icon className="size-5 text-primary" />
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{f.body}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Proof */}
        <section className="border-t border-border py-16">
          <div className="grid grid-cols-1 gap-6 rounded-xl border border-border bg-card p-8 md:grid-cols-3">
            <Proof k="Live integration" v="Reads real oracles + the SVI surface and prices trades via devInspect against the deployed Predict contract." />
            <Proof k="Real execution" v="Signs and lands predict::mint / mint_range / supply on testnet, with a forkable Strategy object minted per strategy." />
            <Proof k="Nothing mocked" v="Cost from on-chain devInspect, distribution from the protocol's price function, risk from live vault state." />
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border py-20 text-center">
          <h2 className="text-3xl font-semibold">Open the Studio</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Connect a Sui testnet wallet, describe a view, and watch it compile, price, and execute
            live.
          </p>
          <Button size="lg" onClick={onLaunch} className="mt-7 gap-1.5">
            Launch app <ArrowRight className="size-4" />
          </Button>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        DeepForge - the programming environment for DeepBook Predict. Sui Testnet.
      </footer>
    </div>
  );
}

function Proof({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-primary">{k}</div>
      <div className="text-sm text-muted-foreground">{v}</div>
    </div>
  );
}
