import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import {
  deploymentFor,
  type PredictDeployment,
  type SuiNetwork,
} from "@deepforge/config";

export interface DeepforgeClientOptions {
  network?: SuiNetwork;
  fullnodeUrl?: string;
  /** Override the Predict deployment (e.g. a fresh testnet redeploy). */
  deployment?: PredictDeployment;
  /** Predict indexer base url override. */
  predictServerUrl?: string;
}

export interface DeepforgeContext {
  client: SuiClient;
  network: SuiNetwork;
  deployment: PredictDeployment;
  predictServerUrl: string;
}

/** Build the shared client context used by every SDK call. */
export function makeContext(opts: DeepforgeClientOptions = {}): DeepforgeContext {
  const network = opts.network ?? "testnet";
  const deployment = opts.deployment ?? deploymentFor(network);
  const url = opts.fullnodeUrl ?? getFullnodeUrl(network);
  return {
    client: new SuiClient({ url }),
    network,
    deployment,
    predictServerUrl: opts.predictServerUrl ?? deployment.predictServerUrl,
  };
}

/** A normalized zero address, valid for read-only devInspect sender. */
export const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
