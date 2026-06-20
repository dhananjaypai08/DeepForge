import { useEffect, useState, type ReactNode } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import {
  Activity as ActivityIcon,
  GitFork,
  LayoutGrid,
  Rocket,
  Store,
  UploadCloud,
} from "lucide-react";
import { exampleIR, hashIR, validateIR, type StrategyIR } from "@deepforge/ir";
import { Editor, type Mode } from "@/components/Editor";
import { GraphView } from "@/components/GraphView";
import { MathPanel } from "@/components/MathPanel";
import { ActionsPanel, RiskPanel, SimPanel } from "@/components/Panels";
import { PipelineView } from "@/components/PipelineView";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchSpotHint,
  runPipeline,
  type PipelineResult,
  type StageEvent,
} from "@/lib/engine";
import {
  deployStrategy,
  forkStrategy,
  listActivity,
  listStrategies,
  loadStrategyIR,
  publishStrategy,
  type ReplayEvent,
  type SignFn,
  type StrategyCard,
} from "@/lib/onchain";

type Section = "studio" | "market" | "activity";

export function App({ onHome }: { onHome?: () => void } = {}) {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const sign: SignFn = async (input) => {
    const res = await signAndExecute({
      transaction: input.transaction,
      chain: "sui:testnet",
      ...(account ? { account } : {}),
    });
    return { digest: res.digest };
  };

  const [section, setSection] = useState<Section>("studio");
  const [ir, setIr] = useState<StrategyIR>(exampleIR());
  const [mode, setMode] = useState<Mode>("intent");
  const [result, setResult] = useState<PipelineResult>();
  const [stages, setStages] = useState<Record<string, StageEvent>>({});
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [forkParent, setForkParent] = useState<string>();

  async function compileIr(target: StrategyIR) {
    setBusy("Compiling + simulating against live testnet…");
    setError(undefined);
    setResult(undefined);
    setStages({});
    try {
      const r = await runPipeline(target, {
        sender: account?.address,
        onStage: (e) => setStages((prev) => ({ ...prev, [e.key]: e })),
      });
      setResult(r);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(undefined);
    }
  }
  const compile = () => compileIr(ir);

  async function generateFromIntent(text: string) {
    setError(undefined);
    setNotice(undefined);
    setResult(undefined);
    const NON_BTC = /\b(eth|ethereum|sol|solana|sui|doge|xrp|bnb|avax|ada|matic|link|arb|op)\b/i;
    const other = text.match(NON_BTC);
    if (other && !/\b(btc|bitcoin)\b/i.test(text)) {
      setError(
        `DeepBook Predict testnet only lists BTC markets - "${other[0].toUpperCase()}" isn't available. ` +
          `Rephrase your intent for BTC (e.g. "BTC stays in a tight range this hour").`,
      );
      return;
    }
    try {
      setBusy("Reading live market…");
      const spotHint = await fetchSpotHint();
      setBusy("Compiling intent → IR…");
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, spotHint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "intent failed");
      const v = validateIR(data.ir);
      if (!v.ok) throw new Error(v.errors.map((e) => e.message).join("; "));
      setIr(v.ir);
      setMode("dsl");
      setNotice(`Generated "${v.ir.name}" from intent - compiling…`);
      await compileIr(v.ir);
      setNotice(`Generated "${v.ir.name}" from intent.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(undefined);
    }
  }

  function humanize(e: unknown): string {
    const msg = (e as Error)?.message ?? String(e);
    if (/assert_mintable_ask|abort code: 7/i.test(msg)) {
      return (
        "A leg's price is at the protocol's mintable cap (the outcome is near-certain, so it can't " +
        "be traded). Tighten the range or add a directional leg, then recompile and retry."
      );
    }
    if (/password/i.test(msg)) {
      return (
        `Wallet reported a "password"/decrypt error. Gas was already verified, so this is a Slush ` +
        `signing issue - not your password or this app. Lock & unlock Slush (Testnet, updated), or ` +
        `use a passphrase account / different wallet, then retry.`
      );
    }
    return msg;
  }

  async function ensureGas(): Promise<void> {
    if (!account) throw new Error("connect a wallet first");
    const bal = await client.getBalance({ owner: account.address });
    if (BigInt(bal.totalBalance) === 0n) {
      throw new Error(
        `Your wallet (${account.address.slice(0, 10)}…) has 0 testnet SUI for gas. ` +
          `Request SUI at faucet.sui.io (Testnet), then retry.`,
      );
    }
  }

  async function onDeploy() {
    if (!account || !result) return;
    setBusy("Checking gas…");
    setError(undefined);
    try {
      if (result.execPlan.nonMintable.length > 0) {
        throw new Error(
          `Can't deploy: ${result.execPlan.nonMintable.join(", ")} priced outside the protocol's ` +
            `mintable band (the outcome is too certain to trade). Tighten the range or add a ` +
            `directional leg, then recompile.`,
        );
      }
      await ensureGas();
      setBusy("Executing on testnet…");
      const digest = await deployStrategy(client, sign, result.execPlan, account.address);
      setNotice(`Executed on DeepBook Predict - digest ${digest}`);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setBusy(undefined);
    }
  }

  async function onPublish() {
    if (!account || !result) return;
    setBusy("Checking gas…");
    setError(undefined);
    try {
      await ensureGas();
      setBusy(forkParent ? "Forking strategy object…" : "Minting strategy object…");
      const irHash = hashIR(ir);
      const id = forkParent
        ? await forkStrategy(client, sign, forkParent, ir, irHash, result.risk, result.sim)
        : await publishStrategy(client, sign, ir, irHash, result.risk, result.sim);
      setNotice(`${forkParent ? "Forked" : "Published"} Strategy object ${id}`);
      setForkParent(undefined);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setBusy(undefined);
    }
  }

  const nav: { key: Section; label: string; icon: typeof LayoutGrid }[] = [
    { key: "studio", label: "Studio", icon: LayoutGrid },
    { key: "market", label: "Marketplace", icon: Store },
    { key: "activity", label: "Activity", icon: ActivityIcon },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 flex w-60 flex-col border-r border-sidebar-border bg-sidebar p-4">
        <button
          onClick={() => onHome?.()}
          className="mb-6 flex items-center gap-2 text-left"
        >
          <div className="flex size-8 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
            DF
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">DeepForge</div>
            <div className="text-[10px] text-muted-foreground">compiler for DeepBook Predict</div>
          </div>
        </button>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => setSection(n.key)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                section === n.key
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <n.icon className="size-4" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto text-[10px] text-muted-foreground">Sui Testnet · live</div>
      </aside>

      {/* Main */}
      <div className="ml-60 flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <h1 className="text-lg font-semibold capitalize">{section}</h1>
          <ConnectButton />
        </header>
        <main className="flex-1 overflow-auto p-6">
          {section === "studio" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[440px_1fr]">
              <div className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Compose strategy</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Editor
                      ir={ir}
                      onChange={setIr}
                      mode={mode}
                      onModeChange={setMode}
                      onGenerate={generateFromIntent}
                      generating={!!busy}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={compile} disabled={!!busy}>
                        Compile &amp; Simulate
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={onDeploy}
                        disabled={!!busy || !result || !account}
                        className="gap-1.5"
                      >
                        <Rocket className="size-4" /> Deploy
                      </Button>
                      <Button
                        variant="outline"
                        onClick={onPublish}
                        disabled={!!busy || !result || !account}
                        className="gap-1.5"
                      >
                        {forkParent ? <GitFork className="size-4" /> : <UploadCloud className="size-4" />}
                        {forkParent ? "Publish fork" : "Publish"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                {(busy || notice || error || forkParent) && (
                  <div className="flex flex-col gap-2">
                    {busy && <Alert>{busy}</Alert>}
                    {notice && <Alert tone="ok">{notice}</Alert>}
                    {error && <Alert tone="bad">{error}</Alert>}
                    {forkParent && (
                      <Alert>Forking from {forkParent.slice(0, 10)}… - edit and publish.</Alert>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4">
                {!result && Object.keys(stages).length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-14 text-center text-muted-foreground">
                    Compile a strategy to see the pipeline, math, simulation and risk - all from live
                    testnet data.
                  </div>
                )}
                {Object.keys(stages).length > 0 && <PipelineView stages={stages} />}
                {result && (
                  <>
                    <GraphView graph={result.graph} />
                    <MathPanel plan={result.plan} oracle={result.oracle} execPlan={result.execPlan} />
                    <ActionsPanel plan={result.execPlan} />
                    <SimPanel sim={result.sim} />
                    <RiskPanel risk={result.risk} />
                  </>
                )}
              </div>
            </div>
          )}

          {section === "market" && (
            <Marketplace
              client={client}
              onFork={async (id) => {
                try {
                  setIr(await loadStrategyIR(client, id));
                  setForkParent(id);
                  setNotice(undefined);
                  setSection("studio");
                  setMode("dsl");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}

          {section === "activity" &&
            (account ? (
              <Replay client={client} sender={account.address} />
            ) : (
              <div className="text-muted-foreground">Connect a wallet to see your activity.</div>
            ))}
        </main>
      </div>
    </div>
  );
}

function Alert({ children, tone }: { children: ReactNode; tone?: "ok" | "bad" }) {
  const cls =
    tone === "bad"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : tone === "ok"
        ? "border-success/40 bg-success/5"
        : "border-border bg-secondary/40";
  return (
    <div className={`whitespace-pre-wrap break-words rounded-md border p-3 text-xs ${cls}`}>
      {children}
    </div>
  );
}

function Marketplace({
  client,
  onFork,
}: {
  client: ReturnType<typeof useSuiClient>;
  onFork: (id: string) => void;
}) {
  const [items, setItems] = useState<StrategyCard[]>([]);
  const refresh = () => listStrategies(client).then(setItems).catch(() => {});
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          On-chain, forkable Strategy objects (live from <code>StrategyPublished</code> events).
        </p>
        <Button variant="outline" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground">No published strategies yet.</div>
        )}
        {items.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                {s.name}
                {s.parent && <Badge variant="secondary">fork</Badge>}
              </CardTitle>
              <span className="font-mono text-[11px] text-muted-foreground">
                by {s.author.slice(0, 12)}…
              </span>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <Badge variant="outline">risk {s.riskScore}/100</Badge>
              <Button size="sm" variant="secondary" className="gap-1" onClick={() => onFork(s.id)}>
                <GitFork className="size-3.5" /> Fork
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Replay({
  client,
  sender,
}: {
  client: ReturnType<typeof useSuiClient>;
  sender: string;
}) {
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  useEffect(() => {
    listActivity(client, sender).then(setEvents).catch(() => {});
  }, [client, sender]);
  if (events.length === 0)
    return <div className="text-muted-foreground">No activity yet - publish or deploy a strategy.</div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Activity timeline</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-primary shadow-[0_0_0_3px_var(--secondary)]" />
            <span className="text-sm">{e.label}</span>
            <a
              className="ml-auto font-mono text-xs text-primary hover:underline"
              href={`https://suiscan.xyz/testnet/tx/${e.digest}`}
              target="_blank"
              rel="noreferrer"
            >
              {e.digest.slice(0, 10)}…
            </a>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
