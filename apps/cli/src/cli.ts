#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { Command } from "commander";
import { Transaction } from "@mysten/sui/transactions";
import {
  canonicalJSON,
  fmtDeepforgeFile,
  parseDeepforgeFile,
  serializeDeepforgeFile,
} from "@deepforge/ir";
import { intentToIR } from "@deepforge/intent";
import {
  SUI_CLOCK_OBJECT_ID,
  deepforgePackageId,
  deepforgeTargets,
  type SuiNetwork,
} from "@deepforge/config";
import { baseUnitsToDollars } from "@deepforge/config/market";
import {
  buildCreateManagerTx,
  buildExecutionPTB,
  extractCreatedManagerId,
  getQuoteCoins,
  isManagerOwnedBy,
  makeContext,
} from "@deepforge/predict-sdk";
import { loadKeypair, tryLoadAddress } from "./keypair.js";
import { getManagerId, setManagerId } from "./state.js";
import { preparePlan } from "./pipeline.js";
import { renderActions, renderPlanHeader, renderRisk, renderSim } from "./render.js";

const program = new Command();
program
  .name("deepforge")
  .description("Compile intent into programmable DeepBook Predict strategies")
  .version("0.1.0");

const microUsd = (x: number): bigint => BigInt(Math.round(Math.abs(x) * 1e6));

// ---- intent --------------------------------------------------------------
program
  .command("intent <text>")
  .description("Generate a *.deepforge.yaml from natural language (OpenRouter)")
  .option("-o, --out <file>", "write to file instead of stdout")
  .option("--spot <usd>", "current spot hint for ATM-relative strikes", parseFloat)
  .action(async (text: string, opts: { out?: string; spot?: number }) => {
    const { ir } = await intentToIR(text, { spotHint: opts.spot });
    const yaml = serializeDeepforgeFile(ir);
    if (opts.out) {
      writeFileSync(opts.out, yaml);
      console.log(`wrote ${opts.out}`);
    } else {
      process.stdout.write(yaml);
    }
  });

// ---- fmt -----------------------------------------------------------------
program
  .command("fmt <file>")
  .description("Canonicalize a DeepForge file in place")
  .option("--stdout", "print instead of rewriting the file")
  .action((file: string, opts: { stdout?: boolean }) => {
    const out = fmtDeepforgeFile(readFileSync(file, "utf8"));
    if (opts.stdout) process.stdout.write(out);
    else {
      writeFileSync(file, out);
      console.log(`formatted ${file}`);
    }
  });

// ---- validate ------------------------------------------------------------
program
  .command("validate <file>")
  .description("Validate a DeepForge file against the IR schema")
  .action((file: string) => {
    const ir = parseDeepforgeFile(readFileSync(file, "utf8"));
    console.log(
      `OK — ${ir.name}: ${ir.allocations.length} legs, $${ir.capital.amount} ${ir.capital.quote}, max-loss ${ir.risk.maxLossPct}%`,
    );
  });

// ---- plan (dry run) ------------------------------------------------------
program
  .command("plan <file>")
  .description("Compile, simulate (devInspect, no gas), and assess risk")
  .option("--network <net>", "sui network", "testnet")
  .option("--oracle <id>", "use a specific oracle id")
  .option("--out <file>", "write the resolved execution plan JSON")
  .action(
    async (
      file: string,
      opts: { network: SuiNetwork; oracle?: string; out?: string },
    ) => {
      const prep = await preparePlan(file, {
        network: opts.network,
        oracleId: opts.oracle,
        sender: tryLoadAddress(),
      });
      console.log(renderPlanHeader(prep.plan));
      console.log(renderActions(prep.execPlan));
      console.log(renderSim(prep.sim));
      console.log(renderRisk(prep.risk));
      if (opts.out) {
        writeFileSync(opts.out, JSON.stringify(prep.execPlan, null, 2));
        console.log(`\nexecution plan written to ${opts.out}`);
      }
    },
  );

// ---- apply (execute) -----------------------------------------------------
program
  .command("apply <file>")
  .description("Execute the strategy on testnet (real dUSDC transactions)")
  .option("--network <net>", "sui network", "testnet")
  .option("--oracle <id>", "use a specific oracle id")
  .action(async (file: string, opts: { network: SuiNetwork; oracle?: string }) => {
    const keypair = loadKeypair();
    const sender = keypair.toSuiAddress();
    const prep = await preparePlan(file, {
      network: opts.network,
      oracleId: opts.oracle,
      sender,
    });
    console.log(renderPlanHeader(prep.plan));
    console.log(renderActions(prep.execPlan));

    const ctx = prep.ctx;
    // 1. Ensure a PredictManager.
    let managerId = getManagerId(opts.network, sender);
    if (!managerId || !(await isManagerOwnedBy(ctx, managerId, sender))) {
      console.log("creating PredictManager…");
      const res = await ctx.client.signAndExecuteTransaction({
        signer: keypair,
        transaction: buildCreateManagerTx(ctx),
        options: { showObjectChanges: true, showEffects: true },
      });
      managerId = extractCreatedManagerId(res);
      if (!managerId) throw new Error("failed to create PredictManager");
      setManagerId(opts.network, sender, managerId);
      console.log(`  manager ${managerId}`);
    } else {
      console.log(`using manager ${managerId}`);
    }

    // 2. Check dUSDC balance.
    const coins = await getQuoteCoins(ctx, sender);
    const need = BigInt(prep.execPlan.totalQuoteBaseUnits);
    if (coins.totalBalanceBase < need) {
      throw new Error(
        `insufficient dUSDC: need ${baseUnitsToDollars(need)} have ${baseUnitsToDollars(
          coins.totalBalanceBase,
        )}. Request dUSDC via the DeepBook Predict testnet token form.`,
      );
    }

    // 3. Execute.
    const tx = buildExecutionPTB(ctx, prep.execPlan, {
      managerId,
      quoteCoinIds: coins.coinObjectIds,
      sender,
    });
    const res = await ctx.client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showEvents: true, showBalanceChanges: true },
    });
    console.log(`\nstatus: ${res.effects?.status?.status}`);
    console.log(`digest: ${res.digest}`);
    if (res.effects?.status?.status !== "success") {
      console.log(`error: ${res.effects?.status?.error}`);
      process.exitCode = 1;
    }
  });

// ---- publish (mint Strategy object) --------------------------------------
program
  .command("publish <file>")
  .description("Mint an on-chain, forkable Strategy object for this strategy")
  .option("--network <net>", "sui network", "testnet")
  .option("--oracle <id>", "use a specific oracle id")
  .action(async (file: string, opts: { network: SuiNetwork; oracle?: string }) => {
    const keypair = loadKeypair();
    const sender = keypair.toSuiAddress();
    const prep = await preparePlan(file, {
      network: opts.network,
      oracleId: opts.oracle,
      sender,
    });
    const pkg = deepforgePackageId(process.env.DEEPFORGE_PACKAGE_ID);
    const t = deepforgeTargets(pkg);
    // Store the canonical IR so the strategy is forkable/editable later.
    const blob = canonicalJSON(prep.ir);
    const tx = new Transaction();
    tx.moveCall({
      target: t.publish,
      arguments: [
        tx.pure.string(prep.ir.name),
        tx.pure.string(prep.plan.irHash),
        tx.pure.string(blob),
        tx.pure.u64(prep.risk.overallU64),
        tx.pure.u64(microUsd(prep.sim.bestUsd)),
        tx.pure.bool(prep.sim.bestUsd < 0),
        tx.pure.u64(microUsd(prep.sim.expectedUsd)),
        tx.pure.bool(prep.sim.expectedUsd < 0),
        tx.pure.u64(microUsd(prep.sim.worstUsd)),
        tx.pure.bool(prep.sim.worstUsd < 0),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    const res = await prep.ctx.client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showObjectChanges: true, showEffects: true },
    });
    const created = (res.objectChanges ?? []).find(
      (c) => c.type === "created" && c.objectType.endsWith("::strategy::Strategy"),
    );
    console.log(`status: ${res.effects?.status?.status}`);
    console.log(`digest: ${res.digest}`);
    console.log(
      `Strategy object: ${created && "objectId" in created ? created.objectId : "(not found)"}`,
    );
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exitCode = 1;
});
