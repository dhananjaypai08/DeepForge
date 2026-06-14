import { readFileSync } from "node:fs";
import type { SuiNetwork } from "@deepforge/config";

/** A settled position to redeem permissionlessly on behalf of its owner. */
export interface RedeemEntry {
  managerId: string;
  oracleId: string;
  expiryMs: number;
  quantity: string; // u64 base units
  kind: "binary" | "range";
  direction?: 0 | 1;
  strikeScaled?: string;
  lowerScaled?: string;
  higherScaled?: string;
}

/** A strategy to auto-roll into the next expiry once its oracle settles. */
export interface AutoRollEntry {
  strategyFile: string;
  managerId: string;
  /** The oracle id the strategy is currently deployed against. */
  currentOracleId: string;
}

export interface KeeperConfig {
  network: SuiNetwork;
  pollMs: number;
  redeem: RedeemEntry[];
  autoRoll: AutoRollEntry[];
}

export function loadConfig(path: string): KeeperConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<KeeperConfig>;
  return {
    network: raw.network ?? "testnet",
    pollMs: raw.pollMs ?? 30_000,
    redeem: raw.redeem ?? [],
    autoRoll: raw.autoRoll ?? [],
  };
}
