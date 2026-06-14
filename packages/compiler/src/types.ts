import type { SupportedAsset } from "@deepforge/ir";

/** A resolved leg: intent + policy lowered to concrete strikes and a budget. */
export type ResolvedLeg =
  | {
      kind: "binary";
      label: string;
      direction: 0 | 1; // UP | DOWN
      strikeUsd: number;
      strikeScaled: bigint;
      budgetBaseUnits: bigint;
    }
  | {
      kind: "range";
      label: string;
      lowerUsd: number;
      upperUsd: number;
      lowerScaled: bigint;
      higherScaled: bigint;
      budgetBaseUnits: bigint;
    }
  | {
      kind: "plp";
      label: string;
      budgetBaseUnits: bigint;
    };

/** Output of the compiler: a deterministic, chain-agnostic plan. */
export interface LogicalPlan {
  irHash: string;
  name: string;
  asset: SupportedAsset;
  quote: "DUSDC";
  oracleId: string;
  expiryMs: number;
  capitalBaseUnits: bigint;
  legs: ResolvedLeg[];
  autoRoll: boolean;
  warnings: string[];
}

// --- Strategy graph (DAG) for visualization / replay ----------------------

export type GraphNodeKind =
  | "capital"
  | "allocator"
  | "binary"
  | "range"
  | "plp"
  | "hedge"
  | "settlement"
  | "autoroll"
  | "exit";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Capital flowing into this node, in quote base units. */
  budgetBaseUnits?: bigint;
  meta?: Record<string, string | number>;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface StrategyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CompileError {
  path: string;
  message: string;
}

export type CompileResult =
  | { ok: true; plan: LogicalPlan; graph: StrategyGraph }
  | { ok: false; errors: CompileError[] };
