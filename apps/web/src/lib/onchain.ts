import type { SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { canonicalJSON, type StrategyIR } from "@deepforge/ir";
import {
  SUI_CLOCK_OBJECT_ID,
  deepforgePackageId,
  deepforgeTargets,
} from "@deepforge/config";
import {
  buildCreateManagerTx,
  buildExecutionPTB,
  extractCreatedManagerId,
  getQuoteCoins,
  makeContext,
  type ExecutionPlan,
} from "@deepforge/predict-sdk";
import type { RiskReport } from "@deepforge/risk";
import type { SimulationReport } from "@deepforge/simulator";

/**
 * Sign a transaction with the connected wallet, returning the signed bytes +
 * signature. We then execute with our own testnet client (below), so the wallet
 * only ever signs — no reliance on the wallet's execute path.
 */
export type SignFn = (input: {
  transaction: Transaction;
}) => Promise<{ bytes: string; signature: string }>;

const ctx = () => makeContext({ network: "testnet" });
const microUsd = (x: number) => BigInt(Math.round(Math.abs(x) * 1e6));

async function execAndWait(
  _client: SuiClient,
  sign: SignFn,
  tx: Transaction,
): Promise<SuiTransactionBlockResponse> {
  const { bytes, signature } = await sign({ transaction: tx });
  const client = ctx().client;
  const res = await client.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showObjectChanges: true, showEffects: true, showEvents: true },
  });
  // Ensure the node has indexed effects before we read object changes.
  await client.waitForTransaction({ digest: res.digest });
  return res;
}

const mgrKey = (sender: string) => `df:mgr:testnet:${sender.toLowerCase()}`;

/** Ensure a PredictManager for the sender, creating + caching one if needed. */
export async function ensureManager(
  client: SuiClient,
  sign: SignFn,
  sender: string,
): Promise<string> {
  const cached = localStorage.getItem(mgrKey(sender));
  if (cached) return cached;
  const res = await execAndWait(client, sign, buildCreateManagerTx(ctx()));
  const id = extractCreatedManagerId(res);
  if (!id) throw new Error("failed to create PredictManager");
  localStorage.setItem(mgrKey(sender), id);
  return id;
}

/** Deploy (execute) a quantized plan: ensure manager, fund, mint/supply. */
export async function deployStrategy(
  client: SuiClient,
  sign: SignFn,
  execPlan: ExecutionPlan,
  sender: string,
): Promise<string> {
  const managerId = await ensureManager(client, sign, sender);
  const coins = await getQuoteCoins(ctx(), sender);
  if (coins.totalBalanceBase < BigInt(execPlan.totalQuoteBaseUnits)) {
    throw new Error(
      "insufficient dUSDC — request testnet dUSDC via the DeepBook Predict token form",
    );
  }
  const tx = buildExecutionPTB(ctx(), execPlan, {
    managerId,
    quoteCoinIds: coins.coinObjectIds,
    sender,
  });
  const res = await execAndWait(client, sign, tx);
  if (res.effects?.status?.status !== "success") {
    throw new Error(res.effects?.status?.error ?? "execution failed");
  }
  return res.digest;
}

function publishArgs(
  tx: Transaction,
  ir: StrategyIR,
  irHash: string,
  risk: RiskReport,
  sim: SimulationReport,
) {
  return [
    tx.pure.string(ir.name),
    tx.pure.string(irHash),
    tx.pure.string(canonicalJSON(ir)),
    tx.pure.u64(risk.overallU64),
    tx.pure.u64(microUsd(sim.bestUsd)),
    tx.pure.bool(sim.bestUsd < 0),
    tx.pure.u64(microUsd(sim.expectedUsd)),
    tx.pure.bool(sim.expectedUsd < 0),
    tx.pure.u64(microUsd(sim.worstUsd)),
    tx.pure.bool(sim.worstUsd < 0),
    tx.object(SUI_CLOCK_OBJECT_ID),
  ];
}

function extractStrategyId(res: SuiTransactionBlockResponse): string | undefined {
  const created = (res.objectChanges ?? []).find(
    (c) => c.type === "created" && c.objectType.endsWith("::strategy::Strategy"),
  );
  return created && "objectId" in created ? created.objectId : undefined;
}

/** Mint a new on-chain Strategy object. */
export async function publishStrategy(
  client: SuiClient,
  sign: SignFn,
  ir: StrategyIR,
  irHash: string,
  risk: RiskReport,
  sim: SimulationReport,
): Promise<string> {
  const pkg = deepforgePackageId();
  const tx = new Transaction();
  tx.moveCall({
    target: deepforgeTargets(pkg).publish,
    arguments: publishArgs(tx, ir, irHash, risk, sim),
  });
  const res = await execAndWait(client, sign, tx);
  const id = extractStrategyId(res);
  if (!id) throw new Error("strategy object not found in result");
  return id;
}

/** Fork an existing Strategy object into a new derived strategy. */
export async function forkStrategy(
  client: SuiClient,
  sign: SignFn,
  parentId: string,
  ir: StrategyIR,
  irHash: string,
  risk: RiskReport,
  sim: SimulationReport,
): Promise<string> {
  const pkg = deepforgePackageId();
  const tx = new Transaction();
  tx.moveCall({
    target: deepforgeTargets(pkg).fork,
    arguments: [tx.object(parentId), ...publishArgs(tx, ir, irHash, risk, sim)],
  });
  const res = await execAndWait(client, sign, tx);
  const id = extractStrategyId(res);
  if (!id) throw new Error("forked strategy object not found in result");
  return id;
}

export interface StrategyCard {
  id: string;
  name: string;
  author: string;
  riskScore: number;
  parent?: string;
  irHash: string;
}

/** List published strategies from on-chain StrategyPublished events. */
export async function listStrategies(client: SuiClient): Promise<StrategyCard[]> {
  const pkg = deepforgePackageId();
  const res = await client.queryEvents({
    query: { MoveEventType: `${pkg}::strategy::StrategyPublished` },
    order: "descending",
    limit: 50,
  });
  return res.data.map((e) => {
    const p = e.parsedJson as Record<string, unknown>;
    return {
      id: String(p.id),
      name: String(p.name),
      author: String(p.author),
      riskScore: Number(p.risk_score ?? 0),
      parent: p.parent ? String(p.parent) : undefined,
      irHash: String(p.ir_hash ?? ""),
    };
  });
}

/** Read a Strategy object and recover its IR (from plan_blob) for forking. */
export async function loadStrategyIR(
  client: SuiClient,
  strategyId: string,
): Promise<StrategyIR> {
  const resp = await client.getObject({
    id: strategyId,
    options: { showContent: true },
  });
  const content = resp.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error("strategy not found");
  }
  const fields = content.fields as Record<string, unknown>;
  return JSON.parse(String(fields.plan_blob)) as StrategyIR;
}

export interface ReplayEvent {
  type: string;
  label: string;
  digest: string;
  timestampMs: number;
}

/** Pull recent DeepForge events for an address (publish/fork/execute) for replay. */
export async function listActivity(
  client: SuiClient,
  sender: string,
): Promise<ReplayEvent[]> {
  const pkg = deepforgePackageId();
  const out: ReplayEvent[] = [];
  for (const name of ["StrategyPublished", "StrategyForked", "StrategyExecuted"]) {
    const res = await client.queryEvents({
      query: { MoveEventType: `${pkg}::strategy::${name}` },
      order: "descending",
      limit: 20,
    });
    for (const e of res.data) {
      const p = e.parsedJson as Record<string, unknown>;
      if (p.author && String(p.author).toLowerCase() !== sender.toLowerCase()) continue;
      out.push({
        type: name,
        label: `${name.replace("Strategy", "")} ${String(p.name ?? p.id ?? "").slice(0, 18)}`,
        digest: e.id.txDigest,
        timestampMs: Number(e.timestampMs ?? 0),
      });
    }
  }
  return out.sort((a, b) => a.timestampMs - b.timestampMs);
}
