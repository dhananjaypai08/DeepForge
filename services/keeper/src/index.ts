import { readFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { ORACLE_STATUS } from "@deepforge/config";
import { compile } from "@deepforge/compiler";
import { parseDeepforgeFile } from "@deepforge/ir";
import {
  buildExecutionPTB,
  buildExecutionPlan,
  buildMarketContext,
  buildRedeemPermissionlessTx,
  getOracle,
  getQuoteCoins,
  makeContext,
  type DeepforgeContext,
} from "@deepforge/predict-sdk";
import { loadConfig, type AutoRollEntry, type RedeemEntry } from "./config.js";

function loadKeypair(): Ed25519Keypair {
  const secret = process.env.SUI_PRIVATE_KEY;
  if (!secret) throw new Error("SUI_PRIVATE_KEY is required for the keeper");
  if (secret.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(secret).secretKey);
  }
  return Ed25519Keypair.fromSecretKey(secret);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function redeemKey(e: RedeemEntry): string {
  return `${e.managerId}:${e.oracleId}:${e.kind}:${e.direction ?? ""}:${e.strikeScaled ?? ""}:${e.lowerScaled ?? ""}:${e.higherScaled ?? ""}`;
}

async function tryRedeem(
  ctx: DeepforgeContext,
  keypair: Ed25519Keypair,
  e: RedeemEntry,
): Promise<boolean> {
  const oracle = await getOracle(ctx, e.oracleId);
  if (oracle.status !== ORACLE_STATUS.SETTLED) return false;

  const tx = buildRedeemPermissionlessTx(ctx, {
    managerId: e.managerId,
    oracleId: e.oracleId,
    expiryMs: e.expiryMs,
    quantity: BigInt(e.quantity),
    ...(e.kind === "range"
      ? {
          range: {
            lowerScaled: BigInt(e.lowerScaled!),
            higherScaled: BigInt(e.higherScaled!),
          },
        }
      : { direction: e.direction!, strikeScaled: BigInt(e.strikeScaled!) }),
  });
  try {
    const res = await ctx.client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });
    const ok = res.effects?.status?.status === "success";
    console.log(`[redeem] ${e.oracleId.slice(0, 10)} -> ${ok ? res.digest : res.effects?.status?.error}`);
    return ok;
  } catch (err) {
    // Already redeemed / no position -> treat as done so we stop polling it.
    console.log(`[redeem] ${e.oracleId.slice(0, 10)} skipped: ${(err as Error).message}`);
    return true;
  }
}

async function tryAutoRoll(
  ctx: DeepforgeContext,
  keypair: Ed25519Keypair,
  e: AutoRollEntry,
): Promise<void> {
  const current = await getOracle(ctx, e.currentOracleId);
  if (current.status !== ORACLE_STATUS.SETTLED) return;

  const sender = keypair.toSuiAddress();
  const ir = parseDeepforgeFile(readFileSync(e.strategyFile, "utf8"));
  const market = await buildMarketContext(ctx);
  const compiled = compile(ir, market);
  if (!compiled.ok) {
    console.log(`[autoroll] ${e.strategyFile}: compile failed, skipping`);
    return;
  }
  if (compiled.plan.oracleId === e.currentOracleId) {
    console.log(`[autoroll] ${e.strategyFile}: no newer oracle yet`);
    return;
  }
  const plan = await buildExecutionPlan(ctx, compiled.plan, { sender });
  const coins = await getQuoteCoins(ctx, sender);
  if (coins.totalBalanceBase < BigInt(plan.totalQuoteBaseUnits)) {
    console.log(`[autoroll] ${e.strategyFile}: insufficient dUSDC to roll`);
    return;
  }
  const tx = buildExecutionPTB(ctx, plan, {
    managerId: e.managerId,
    quoteCoinIds: coins.coinObjectIds,
    sender,
  });
  const res = await ctx.client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  if (res.effects?.status?.status === "success") {
    console.log(`[autoroll] rolled ${e.strategyFile} -> oracle ${plan.oracleId.slice(0, 10)} (${res.digest})`);
    e.currentOracleId = plan.oracleId; // advance so we wait for the next settlement
  } else {
    console.log(`[autoroll] failed: ${res.effects?.status?.error}`);
  }
}

async function main() {
  const cfgPath = process.argv[2] ?? process.env.KEEPER_CONFIG;
  if (!cfgPath) throw new Error("usage: keeper <config.json> (or set KEEPER_CONFIG)");
  const cfg = loadConfig(cfgPath);
  const keypair = loadKeypair();
  const ctx = makeContext({ network: cfg.network });

  console.log(
    `DeepForge keeper started as ${keypair.toSuiAddress().slice(0, 10)}… ` +
      `(${cfg.redeem.length} redeem watches, ${cfg.autoRoll.length} auto-rolls, poll ${cfg.pollMs}ms)`,
  );

  const done = new Set<string>();
  let running = true;
  process.on("SIGINT", () => {
    console.log("\nkill switch — shutting down keeper");
    running = false;
  });

  while (running) {
    for (const e of cfg.redeem) {
      const k = redeemKey(e);
      if (done.has(k)) continue;
      try {
        if (await tryRedeem(ctx, keypair, e)) done.add(k);
      } catch (err) {
        console.log(`[redeem] error: ${(err as Error).message}`);
      }
    }
    for (const e of cfg.autoRoll) {
      try {
        await tryAutoRoll(ctx, keypair, e);
      } catch (err) {
        console.log(`[autoroll] error: ${(err as Error).message}`);
      }
    }
    if (cfg.redeem.length > 0 && done.size === cfg.redeem.length && cfg.autoRoll.length === 0) {
      console.log("all redeem watches settled & claimed; exiting");
      break;
    }
    if (running) await sleep(cfg.pollMs);
  }
}

main().catch((e) => {
  console.error(`keeper fatal: ${(e as Error).message}`);
  process.exit(1);
});
