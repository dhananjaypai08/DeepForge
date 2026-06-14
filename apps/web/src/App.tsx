import { useEffect, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { exampleIR, hashIR, type StrategyIR } from "@deepforge/ir";
import { Editor } from "./components/Editor.js";
import { GraphView } from "./components/GraphView.js";
import { ActionsPanel, RiskPanel, SimPanel } from "./components/Panels.js";
import { runPipeline, type PipelineResult } from "./lib/engine.js";
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
  const { mutateAsync } = useSignAndExecuteTransaction();
  const sign: SignFn = (input) => mutateAsync(input);

  const [ir, setIr] = useState<StrategyIR>(exampleIR());
  const [result, setResult] = useState<PipelineResult>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [forkParent, setForkParent] = useState<string>();

  async function compile() {
    setBusy("Compiling + simulating against live testnet…");
    setError(undefined);
    setResult(undefined);
    try {
      setResult(await runPipeline(ir, { sender: account?.address }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function onDeploy() {
    if (!account || !result) return;
    setBusy("Executing on testnet…");
    setError(undefined);
    try {
      const digest = await deployStrategy(client, sign, result.execPlan, account.address);
      setNotice(`Executed on DeepBook Predict — digest ${digest}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function onPublish() {
    if (!account || !result) return;
    setBusy(forkParent ? "Forking strategy object…" : "Minting strategy object…");
    setError(undefined);
    try {
      const irHash = hashIR(ir);
      const id = forkParent
        ? await forkStrategy(client, sign, forkParent, ir, irHash, result.risk, result.sim)
        : await publishStrategy(client, sign, ir, irHash, result.risk, result.sim);
      setNotice(`${forkParent ? "Forked" : "Published"} Strategy object ${id}`);
      setForkParent(undefined);
    } catch (e) {
      setError((e as Error).message);
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
          <Editor ir={ir} onChange={setIr} spotHint={result?.oracle.spot} />
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
          {busy && <div className="notice">{busy}</div>}
          {notice && <div className="notice ok">{notice}</div>}
          {error && <div className="error">{error}</div>}
          {forkParent && (
            <div className="notice">Forking from {forkParent.slice(0, 10)}… — edit and publish.</div>
          )}
        </section>

        <section className="right">
          {!result && <div className="placeholder">Compile a strategy to see the graph, simulation and risk.</div>}
          {result && (
            <>
              <GraphView graph={result.graph} />
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
