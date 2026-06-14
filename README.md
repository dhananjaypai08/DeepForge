# DeepForge

**The programming language & development environment for DeepBook Predict.**

> People don't think in transactions. They think in intent. DeepForge compiles
> intent into programmable financial strategies on DeepBook Predict.

DeepBook Predict (live on Sui testnet) is a vol-surface-priced prediction
protocol: binary up/down positions, vertical ranges, and a PLP vault. Using it
directly means hand-composing strikes, expiries, SVI pricing, exposure and
settlement. DeepForge raises the altitude:

```
Human intent / *.deepforge.yaml
        │   parse + validate            (packages/ir)
        ▼
   Strategy Graph (DAG)                 (packages/compiler)
        │   resolve strikes vs live oracle
        ▼
   Execution Plan                       (packages/predict-sdk: devInspect, no gas)
        │   simulate + score risk       (packages/simulator, packages/risk)
        ▼
   PTB → DeepBook Predict mint/range/supply   (real testnet tx)
        │
        ▼
   Forkable, versioned Strategy object  (move/deepforge, on-chain)
```

The declarative `*.deepforge.yaml` file is a first-class artifact — written by
hand or generated from a prompt — then **`plan`** (dry-run, priced, simulated)
and **`apply`** (executed), exactly like `terraform plan` / `terraform apply`.

## Verified on testnet

Everything below is real and was exercised against live Sui testnet during the
build (not mocked):

- **DeepBook Predict integration** — package `0xf5ea2b37…`, `Predict` object
  `0xc8736204…`, dUSDC `0xe9504008…::dusdc::DUSDC`. The SDK reads live oracles
  (4000+ BTC oracles via the indexer), parses the SVI surface, reads vault
  state, and **prices trades via `devInspect`** (e.g. UP @ $65,400 → 0.542/$1).
- **DeepForge Strategy package** — `deepforge::strategy` published to testnet at
  `0x1269aef399929af4e689c3d92978f40cfde79412e3557bf3e415f04be016b392`.
- **Full `plan` / `apply` / `publish`** verified live: compiled a YAML strategy,
  priced both legs via devInspect, created a real `PredictManager`, and minted a
  real on-chain Strategy object.
- **32 unit tests** (ir, compiler, simulator, risk, intent, config) + **2 Move
  tests**, all green.

> Predict testnet ids rotate and mainnet will differ — they live in one place
> (`packages/config/src/index.ts`) and are re-verified at build start.

## Monorepo layout

| Package | Role |
| --- | --- |
| `packages/config` | Verified on-chain ids, constants, scaling, market types |
| `packages/ir` | Financial IR + `*.deepforge.yaml` parse/serialize/fmt/validate/hash + JSON Schema |
| `packages/compiler` | IR → strategy graph (DAG) → strike resolution → `LogicalPlan` (pure, deterministic) |
| `packages/simulator` | Faithful port of the protocol's SVI/Black-Scholes pricing + risk-neutral scenario distribution |
| `packages/risk` | Deterministic risk/liquidity/oracle/vol/settlement/tail scores from live state |
| `packages/predict-sdk` | PTB builders (mint/range/supply/redeem), `devInspect` previews, object reads, indexer client |
| `packages/intent` | OpenRouter NL→IR with strict JSON-schema tool calling + bounded repair |
| `apps/cli` | `deepforge` CLI — the IaC driver (`intent`/`fmt`/`validate`/`plan`/`apply`/`publish`) |
| `apps/web` | React + dApp Kit app: 3 input modes, graph, simulator, risk dashboard, marketplace, replay |
| `services/keeper` | Settled-redeem keeper + strategy auto-roll |
| `move/deepforge` | `deepforge::strategy` Move package — forkable, versioned Strategy objects + events |

The `ir`/`compiler`/`simulator`/`risk` core is pure, deterministic TypeScript:
the LLM only does NL→IR extraction; all financial logic is code.

## Quick start

```bash
pnpm install
pnpm -r --filter "./packages/*" build      # build the libraries
pnpm test                                   # 32 unit tests
(cd move/deepforge && sui move test)        # 2 Move tests
```

### CLI (the IaC lifecycle)

```bash
# 1. Author by hand, or generate from intent (needs OPENROUTER_API_KEY):
node apps/cli/dist/cli.js intent "BTC stays 118k-120k for an hour, risk \$50, cap loss 10%" -o s.deepforge.yaml

# 2. Dry-run: compile + price via devInspect + simulate + risk (no gas):
node apps/cli/dist/cli.js plan examples/btc-range.deepforge.yaml

# 3. Execute on testnet (needs SUI_PRIVATE_KEY + testnet SUI + dUSDC):
node apps/cli/dist/cli.js apply examples/btc-range.deepforge.yaml

# 4. Mint a forkable Strategy object (gas only):
node apps/cli/dist/cli.js publish examples/btc-range.deepforge.yaml
```

### Web app

```bash
pnpm --filter @deepforge/web dev    # vite (5173) + intent proxy (8787)
```

### Keeper

```bash
SUI_PRIVATE_KEY=... node services/keeper/dist/index.js examples/keeper.config.json
```

## Requirements for live execution

- **Testnet SUI** for gas: `sui client faucet` (point your env at
  `https://fullnode.testnet.sui.io:443` — the default `testnet` alias in some
  installs incorrectly points at devnet).
- **dUSDC** (separate from official USDC): request via the DeepBook Predict
  testnet token form. `apply` will tell you the exact amount needed.
- **`SUI_PRIVATE_KEY`** (`suiprivkey1…`) for `apply`/`publish` and the keeper.
- **`OPENROUTER_API_KEY`** for `deepforge intent` and the web Intent mode.

See `.env.example`.

## How the numbers stay honest

- Trade **cost** always comes from the protocol's own `get_trade_amounts` via
  `devInspect` — never an approximation.
- The simulator's terminal distribution is the model's own risk-neutral law,
  read directly from the binary price function, so payoff and pricing are
  mutually consistent. PLP legs are marked principal-preserving (fees not
  modeled per-scenario) rather than guessed.
- Risk scores are explicit formulas over live vault/oracle state.
