# DeepForge - Demo Script & Pitch

## Part A. Live demo flow (about 4 minutes)

Goal: show that DeepForge compiles a plain-English view into a real, priced,
simulated, risk-scored, on-chain strategy on DeepBook Predict, and that
strategies are forkable on-chain objects. Everything is live testnet, nothing
mocked.

Setup before you present:
- Wallet: a Sui Testnet passphrase account (not Google/zkLogin) with some SUI
  for gas and dUSDC for the deploy step.
- App running (web). Land on the home page.

### 1. The framing (15s)
"Everyone else builds apps that use DeepBook. We built the programming
environment that makes building on DeepBook easy. People think in intent, not
in strikes and oracles. DeepForge compiles intent into programmable strategies."

Click "Launch app" -> Studio.

### 2. Intent -> the declarative file (30s)
In the Intent tab, type a real view:
> "BTC stays in a tight range for the next hour, small size, cap loss at 20%."

Click Generate. Narrate while the pipeline runs:
- It reads the live market, asks the model to extract intent into a typed
  Financial IR, then flips to the DSL tab so you can see the artifact.

Point at the `*.deepforge.yaml`:
"This is the contract everything compiles from - like a Terraform file for a
trading strategy. The model only did English to this typed file; every number
after this is deterministic code."

### 3. The compiler pipeline (30s)
The right panel shows the pipeline executing stage by stage:
- Read live market (on-chain oracles)
- Compile intent -> strategy graph
- Price every leg on-chain (devInspect, no gas)
- Simulate payoff distribution
- Assess risk vs live vault state

"This is the compiler. Each stage runs against real testnet data. Pricing is the
key one - it asks the protocol itself for the price via devInspect, so it costs
no gas and is the exact number the contract will charge."

### 4. Under the hood - the math is visible (40s)
Scroll to the "Under the hood" card.
"This is the live volatility surface from the oracle - the SVI parameters. For
each leg we compute log-moneyness k, pull total variance w(k) off the surface,
get d2, and Phi(d2) is the probability BTC ends past that strike. The
probability curve is the live risk-neutral distribution; the colored lines are
this strategy's strikes."

Point at the table: "model P is our computed probability; live ask is the price
the contract returned. They line up - the gap is the protocol's spread. Nothing
here is faked."

### 5. Simulation + risk (30s)
"The simulation samples that same distribution: best, expected, worst, and the
probability of profit. The risk dashboard scores liquidity, oracle freshness,
tail loss and your max-loss policy from live vault state."

If you get the "no edge" callout, use it: "A near-certain range is priced at fair
value - you win often but only break even. Watch what happens when I tighten it
or add a directional leg." (Switch to Visual, lower the range width or add a
binary_up leg, Compile again - the distribution comes alive.)

### 6. Deploy - a real on-chain position (30s)
Click Deploy. Wallet signs. A "Signed transactions" card appears with an
explorer link.
"That just created my Predict account, deposited dUSDC, and minted the position.
Here it is on-chain." Open the tx link - point at the RangeMinted / mint event.

### 7. Publish + Marketplace + Fork (40s)
Click Publish. "Now I mint the strategy itself as a forkable on-chain object -
the recipe, its risk score, its simulation, the IR hash. Gas only, no dUSDC."
Explorer link appears for the object.

Go to Marketplace -> the strategy is listed. Click Fork on it.
"Forking loads the original recipe into the editor." Change the range width or a
weight in the DSL, click Compile (numbers update live), then Publish fork.
"Now there's a child strategy that records its parent on-chain. GitHub for
strategies."

### 8. Close (15s)
"So: a sentence became a typed strategy file, compiled to a priced and simulated
plan, executed as a real DeepBook Predict position, and published as a forkable
on-chain object - all live, all verifiable on the explorer. DeepForge is the
compiler and IDE for DeepBook Predict."

---

## Part B. Presentation content

### Slide 1 - Title
DeepForge: the programming language and development environment for DeepBook
Predict. "Compile intent into programmable on-chain strategies." (Sui Testnet.)

### Slide 2 - The problem
Prediction markets are becoming real market structure, but building on them is
low-level and expert-only:
- To create a strategy on DeepBook Predict you must hand-compose binary
  positions, vertical ranges, strike selection, the SVI volatility surface,
  PLP liquidity, exposure limits, expiry, settlement, and rollovers.
- That is the equivalent of writing assembly. It is error-prone and excludes
  almost everyone.
- There is no portable, shareable, auditable unit of "a strategy" - logic lives
  in scripts and notebooks, not as composable on-chain objects.

### Slide 3 - The insight
People think in intent, not transactions. Just as C compiles to machine code,
intent should compile to financial primitives:
  Intent -> Financial IR -> Strategy graph -> Optimize -> Simulate -> Risk ->
  Execution plan -> Programmable Transaction Block.
DeepBook Predict is the instruction set; DeepForge is the compiler on top.

### Slide 4 - The solution
DeepForge: a compiler + IDE for DeepBook Predict.
- Three front-ends, one typed artifact: English (Intent), Visual builder, and a
  declarative `*.deepforge.yaml` DSL - all compile to the same Financial IR.
- A deterministic pipeline: resolve strikes against the live oracle, price every
  leg on-chain via devInspect, simulate the payoff distribution from the
  protocol's own volatility model, score risk from live vault state.
- Terraform-style lifecycle: `plan` (dry-run, priced, simulated) and `apply`
  (executed), in both a web app and a CLI.
- Strategies become forkable, versioned on-chain Sui objects - GitHub for
  strategies.

### Slide 5 - Why it is correct, not a wrapper
- The LLM only does English -> typed IR. All financial logic is deterministic,
  unit-tested code.
- Trade cost comes from the protocol's `get_trade_amounts` via devInspect - the
  exact on-chain price, never an estimate.
- The simulation distribution is read from the same SVI price function the
  protocol uses, so pricing and payoff are mutually consistent.
- Risk is computed from live vault state (utilization, payout coverage, oracle
  freshness, tail loss).
- It even respects protocol limits: legs priced outside the mintable ask band
  are blocked before signing, with a plain-English reason.

### Slide 6 - Architecture
- packages: ir (Financial IR + DSL), compiler (IR -> graph -> plan), simulator
  (ported SVI/Black-Scholes + scenario distribution), risk, predict-sdk (PTB
  builders, devInspect previews, object reads), intent (NL -> IR).
- move/deepforge: the Strategy object package (publish / fork / events).
- apps: web (the IDE) and cli (the IaC driver). services: keeper (auto-roll /
  redeem).
- Live on Sui Testnet against the deployed DeepBook Predict contract.

### Slide 7 - Live demo
(Run Part A.) Key beats: intent -> file -> pipeline -> visible math -> deploy
(explorer link) -> publish -> fork.

### Slide 8 - Composability and what is next
- Strategy objects are first-class: versioned, forkable, transferable, auditable
  - other Sui protocols can read and build on them.
- Keeper network for settled-redeem and auto-roll.
- Mainnet day one: only the contract ids in one config module change.
- Roadmap: cross-protocol legs (deepbook_margin, iron_bank), a strategy
  leaderboard, and tokenized vault shares on top of PredictManager.

### Slide 9 - Takeaway
Everyone else built products using DeepBook. DeepForge is the programming
environment that makes building on DeepBook dramatically easier - and turns
strategies into composable on-chain assets.
