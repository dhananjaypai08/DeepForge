/**
 * The ExecutionPlan is the chain-derived, fully-resolved action list produced
 * by quantizing a compiler LogicalPlan against live previews. bigints are
 * encoded as decimal strings so a plan is JSON-serializable (it gets stored in
 * the Strategy object / Walrus blob and replayed by the keeper).
 */

export interface ExecStepMint {
  op: "mint";
  legLabel: string;
  oracleId: string;
  expiryMs: number;
  strikeScaled: string; // u64 (price * FLOAT_SCALING)
  direction: 0 | 1;
  quantity: string; // u64 base units of payoff face
  costBaseUnits: string; // previewed mint cost
}

export interface ExecStepRange {
  op: "mint_range";
  legLabel: string;
  oracleId: string;
  expiryMs: number;
  lowerScaled: string;
  higherScaled: string;
  quantity: string;
  costBaseUnits: string;
}

export interface ExecStepSupply {
  op: "supply";
  legLabel: string;
  amountBaseUnits: string;
}

export type ExecStep = ExecStepMint | ExecStepRange | ExecStepSupply;

export interface ExecutionPlan {
  irHash: string;
  name: string;
  oracleId: string;
  expiryMs: number;
  quoteType: string;
  plpType: string;
  /** dUSDC to deposit into the manager to fund all mint/range legs. */
  depositBaseUnits: string;
  /** dUSDC routed directly into PLP supply. */
  supplyBaseUnits: string;
  /** Total dUSDC the wallet must provide (deposit + supply). */
  totalQuoteBaseUnits: string;
  steps: ExecStep[];
  /** Per-leg unit cost (ask), captured at quantize time for the simulator. */
  unitCosts: Record<number, number>;
}
