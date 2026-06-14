/**
 * @deepforge/config — single source of truth for on-chain constants.
 *
 * All values under DEEPBOOK_PREDICT_TESTNET were verified verbatim against the
 * live `predict-testnet-4-16` branch of MystenLabs/deepbookv3
 * (scripts/config/constants.ts + packages/predict/sources/*).
 *
 * NOTE: Predict testnet deployments rotate and mainnet IDs will differ. Treat
 * these as the integration target for the hackathon and re-verify before a
 * fresh deploy. Oracle IDs are intentionally absent — oracles are created per
 * (underlying, expiry) and must be discovered at runtime.
 */

export type SuiNetwork = "testnet" | "mainnet" | "devnet" | "localnet";

/** Fixed-point scaling used by Predict for prices, percentages and SVI params. */
export const FLOAT_SCALING = 1_000_000_000n; // 1e9
export const FLOAT_SCALING_NUM = 1e9;

/** dUSDC (and PLP) use 6 decimals. 1_000_000 base units == $1 of settlement. */
export const QUOTE_DECIMALS = 6;
export const QUOTE_UNIT = 1_000_000n; // one dollar in base units

/** Shared Sui system objects. */
export const SUI_CLOCK_OBJECT_ID = "0x6";

/**
 * Default strike-grid tick (USD) used when the live oracle's tick size cannot
 * be read. OracleSVI does not expose tick_size on-chain on this branch, so the
 * builder fills it from the indexer when available and falls back to this.
 * Strikes are validated for real at preview/apply time by get_trade_amounts.
 */
export const DEFAULT_STRIKE_TICK_USD = 100;

/** Oracle update staleness threshold (constants.move). */
export const STALENESS_THRESHOLD_MS = 30_000;

/** OracleSVI lifecycle status codes (oracle.move). */
export const ORACLE_STATUS = {
  INACTIVE: 0,
  ACTIVE: 1,
  PENDING_SETTLEMENT: 2,
  SETTLED: 3,
} as const;
export type OracleStatus = (typeof ORACLE_STATUS)[keyof typeof ORACLE_STATUS];

/** Binary position direction (market_key.move: direction u8). */
export const DIRECTION = { UP: 0, DOWN: 1 } as const;

export interface PredictDeployment {
  network: SuiNetwork;
  /** Named Move address `deepbook_predict` -> on-chain package id. */
  predictPackageId: string;
  predictObjectId: string; // shared `Predict`
  registryId: string;
  adminCapId: string;
  upgradeCapId: string;
  dusdcPackageId: string;
  dusdcCurrencyId: string;
  /** Fully-qualified quote coin type. */
  dusdcType: string;
  /** Fully-qualified PLP coin type (module `deepbook_predict::plp`). */
  plpType: string;
  /** Default public indexer (verify the live host before relying on routes). */
  predictServerUrl: string;
}

export const DEEPBOOK_PREDICT_TESTNET: PredictDeployment = (() => {
  const predictPackageId =
    "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
  const dusdcPackageId =
    "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a";
  return {
    network: "testnet",
    predictPackageId,
    predictObjectId:
      "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a",
    registryId:
      "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64",
    adminCapId:
      "0x9faa4d2c0f4aaf7c9a50d3278490ffdf31f9ca1ffd1c41063578dcf3e29c2a6b",
    upgradeCapId:
      "0x70d7658401a4454c71891780f2763ddd267257c39bf951f1017587fd8842ca51",
    dusdcPackageId,
    dusdcCurrencyId:
      "0xf3000dff421833d4bb8ed58fac146d691a3aaba2785aa1989af65a7089ca3e9c",
    dusdcType: `${dusdcPackageId}::dusdc::DUSDC`,
    plpType: `${predictPackageId}::plp::PLP`,
    predictServerUrl: "https://predict-server.testnet.mystenlabs.com",
  };
})();

/** Move call targets, derived from the package id. */
export function predictTargets(pkg: string) {
  return {
    createManager: `${pkg}::predict::create_manager`,
    mint: `${pkg}::predict::mint`,
    redeem: `${pkg}::predict::redeem`,
    redeemPermissionless: `${pkg}::predict::redeem_permissionless`,
    mintRange: `${pkg}::predict::mint_range`,
    redeemRange: `${pkg}::predict::redeem_range`,
    supply: `${pkg}::predict::supply`,
    withdraw: `${pkg}::predict::withdraw`,
    getTradeAmounts: `${pkg}::predict::get_trade_amounts`,
    getRangeTradeAmounts: `${pkg}::predict::get_range_trade_amounts`,
    askBounds: `${pkg}::predict::ask_bounds`,
    availableWithdrawal: `${pkg}::predict::available_withdrawal`,
    // market_key / range_key constructors
    marketKeyUp: `${pkg}::market_key::up`,
    marketKeyDown: `${pkg}::market_key::down`,
    marketKeyNew: `${pkg}::market_key::new`,
    rangeKeyNew: `${pkg}::range_key::new`,
    // manager helpers
    managerDeposit: `${pkg}::predict_manager::deposit`,
    managerWithdraw: `${pkg}::predict_manager::withdraw`,
  } as const;
}

/**
 * DeepForge Strategy-object package (deepforge::strategy), published to testnet.
 * Override via DEEPFORGE_PACKAGE_ID env when you redeploy.
 */
export const DEEPFORGE_STRATEGY_PACKAGE_TESTNET =
  "0x1269aef399929af4e689c3d92978f40cfde79412e3557bf3e415f04be016b392";

/** Resolve the DeepForge package id (env override wins). */
export function deepforgePackageId(envOverride?: string): string {
  return envOverride && envOverride.startsWith("0x")
    ? envOverride
    : DEEPFORGE_STRATEGY_PACKAGE_TESTNET;
}

export function deepforgeTargets(pkg: string) {
  return {
    publish: `${pkg}::strategy::publish`,
    fork: `${pkg}::strategy::fork`,
    recordExecution: `${pkg}::strategy::record_execution`,
  } as const;
}

const FULLNODE_URLS: Record<SuiNetwork, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
  devnet: "https://fullnode.devnet.sui.io:443",
  localnet: "http://127.0.0.1:9000",
};

export function fullnodeUrl(network: SuiNetwork): string {
  return FULLNODE_URLS[network];
}

/** Resolve a deployment for a network (only testnet is populated today). */
export function deploymentFor(network: SuiNetwork): PredictDeployment {
  if (network === "testnet") return DEEPBOOK_PREDICT_TESTNET;
  throw new Error(
    `No DeepBook Predict deployment configured for network "${network}". ` +
      `Only testnet is available on the predict-testnet-4-16 branch.`,
  );
}
