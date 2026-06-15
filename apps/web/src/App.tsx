import { useEffect, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { exampleIR, hashIR, validateIR, type StrategyIR } from "@deepforge/ir";
import { Editor, type Mode } from "./components/Editor.js";
import { GraphView } from "./components/GraphView.js";
import { MathPanel } from "./components/MathPanel.js";
import { ActionsPanel, RiskPanel, SimPanel } from "./components/Panels.js";
import { fetchSpotHint, runPipeline, type PipelineResult } from "./lib/engine.js";
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
} from "./lib/onchain.js";

export function App() {
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

  const [ir, setIr] = useState<StrategyIR>(exampleIR());
  const [mode, setMode] = useState<Mode>("intent");
  const [result, setResult] = useState<PipelineResult>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [forkParent, setForkParent] = useState<string>();

  async function compileIr(target: StrategyIR) {
    setBusy("Compiling + simulating against live testnet…");
    setError(undefined);
    setResult(undefined);
    try {
      const r = await runPipeline(target, { sender: account?.address });
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

  /** Intent flow: read market → compile intent to IR → show it → simulate. */
  async function generateFromIntent(text: string) {
    setError(undefined);
    setNotice(undefined);
    setResult(undefined);
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
      setMode("dsl"); // show the generated *.deepforge.yaml
      setNotice(`Generated "${v.ir.name}" from intent — compiling…`);
      await compileIr(v.ir);
      setNotice(`Generated "${v.ir.name}" from intent.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(undefined);
    }
  }

  /** Turn opaque wallet errors into actionable guidance. */
  function humanize(e: unknown): string {
    const msg = (e as Error)?.message ?? String(e);
    if (/password/i.test(msg)) {
      return (
        `Wallet reported a "password"/decrypt error. Gas was already verified, so this is ` +
        `a Slush signing issue — not your password or this app. Try: lock and unlock the ` +
        `Slush extension, confirm it's on Testnet and updated, then retry. If it persists, ` +
        `connect a different wallet (Suiet / Nightly), or run the same step from the CLI ` +
        `(node apps/cli/dist/cli.js publish …), which signs directly and is verified working.`
      );
    }
    return msg;
  }

  /** Fail fast with a clear message if the wallet can't pay gas. */
  async function ensureGas(): Promise<void> {
    if (!account) throw new Error("connect a wallet first");
    const bal = await client.getBalance({ owner: account.address });
    if (BigInt(bal.totalBalance) === 0n) {
      throw new Error(
        `Your connected wallet (${account.address.slice(0, 10)}…) has 0 testnet SUI for gas. ` +
          `Copy this address and request SUI at faucet.sui.io (Testnet), then retry. ` +
          `(A "wrong password" prompt from the wallet usually means this.)`,
      );
    }
  }

  async function onDeploy() {
    if (!account || !result) return;
    setBusy("Checking gas…");
    setError(undefined);
    try {
      await ensureGas();
      setBusy("Executing on testnet…");
      const digest = await deployStrategy(client, sign, result.execPlan, account.address);
      setNotice(`Executed on DeepBook Predict — digest ${digest}`);
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

  return (
    <div className="app">
      <header>
        <div>
          <h1>DeepForge</h1>
          <span className="tagline">Compile intent into programmable DeepBook Predict strategies</span>
        </div>
        <ConnectButton />
      </header>

      <div className="cols">
        <section className="left">
          <Editor
            ir={ir}
            onChange={setIr}
            mode={mode}
            onModeChange={setMode}
            onGenerate={generateFromIntent}
            generating={!!busy}
          />
          <div className="actions">
            <button className="btn primary" onClick={compile} disabled={!!busy}>
              Compile &amp; Simulate
            </button>
            <button className="btn" onClick={onDeploy} disabled={!!busy || !result || !account}>
              Deploy (execute)
            </button>
            <button className="btn" onClick={onPublish} disabled={!!busy || !result || !account}>
              {forkParent ? "Publish fork" : "Publish strategy object"}
            </button>
          </div>
          <div className="status-area">
            {busy && <div className="notice">{busy}</div>}
            {notice && <div className="notice ok">{notice}</div>}
            {error && <div className="error">{error}</div>}
            {forkParent && (
              <div className="notice">Forking from {forkParent.slice(0, 10)}… — edit and publish.</div>
            )}
          </div>
        </section>

        <section className="right">
          {!result && <div className="placeholder">Compile a strategy to see the graph, simulation and risk.</div>}
          {result && (
            <>
              <GraphView graph={result.graph} />
              <MathPanel plan={result.plan} oracle={result.oracle} execPlan={result.execPlan} />
              <ActionsPanel plan={result.execPlan} />
              <SimPanel sim={result.sim} />
              <RiskPanel risk={result.risk} />
            </>
          )}
        </section>
      </div>

      <Marketplace
        client={client}
        onFork={async (id) => {
          try {
            setIr(await loadStrategyIR(client, id));
            setForkParent(id);
            setNotice(undefined);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      {account && <Replay client={client} sender={account.address} />}
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
    <section className="market">
      <h2>
        Strategy marketplace <button className="btn ghost small" onClick={refresh}>↻</button>
      </h2>
      <div className="cards">
        {items.length === 0 && <div className="muted">No published strategies yet.</div>}
        {items.map((s) => (
          <div className="card" key={s.id}>
            <div className="card-title">{s.name}</div>
            <div className="muted small">by {s.author.slice(0, 10)}…</div>
            <div className="card-meta">
              risk {s.riskScore}/100 {s.parent ? "· fork" : ""}
            </div>
            <button className="btn ghost small" onClick={() => onFork(s.id)}>
              Fork
            </button>
          </div>
        ))}
      </div>
    </section>
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
  if (events.length === 0) return null;
  return (
    <section className="replay">
      <h2>Activity replay</h2>
      <div className="timeline">
        {events.map((e, i) => (
          <div className="tl-item" key={i}>
            <div className="tl-dot" />
            <div className="tl-body">
              <strong>{e.label}</strong>
              <a
                href={`https://suiscan.xyz/testnet/tx/${e.digest}`}
                target="_blank"
                rel="noreferrer"
              >
                {e.digest.slice(0, 10)}…
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
