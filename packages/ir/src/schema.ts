import { z } from "zod";

/**
 * The DeepForge Financial IR — the canonical, declarative description of a
 * strategy. This is what a `*.deepforge.yaml` file serializes to, what the
 * intent LLM emits, and what the compiler consumes. It contains *intent and
 * policy*, never resolved on-chain ids (those are produced by the compiler at
 * `plan` time against live oracles).
 */

export const IR_VERSION = "0.1" as const;

export const SupportedAsset = z.enum(["BTC"]);
export type SupportedAsset = z.infer<typeof SupportedAsset>;

export const QuoteAsset = z.enum(["DUSDC"]);
export type QuoteAsset = z.infer<typeof QuoteAsset>;

/** A positive USD amount of quote capital (human units, e.g. 300 == $300). */
const usd = z.number().positive().finite();
const pct = z.number().min(0).max(100);
const bps = z.number().min(0).max(100_000);

/** How a strike is chosen for a leg. Exactly one of these must be set. */
export const StrikeSelector = z
  .object({
    /** Absolute strike price in USD (e.g. 119000). */
    price: z.number().positive().finite().optional(),
    /** Offset from at-the-money in basis points (+ above spot, - below). */
    atmOffsetBps: z.number().finite().optional(),
    /** Offset from ATM expressed in SVI-implied standard deviations. */
    atmSigma: z.number().finite().optional(),
  })
  .refine(
    (s) =>
      [s.price, s.atmOffsetBps, s.atmSigma].filter((v) => v !== undefined)
        .length === 1,
    { message: "exactly one of {price, atmOffsetBps, atmSigma} must be set" },
  );
export type StrikeSelector = z.infer<typeof StrikeSelector>;

/** Bounds for a vertical range, chosen by absolute price or width around ATM. */
export const RangeBounds = z
  .object({
    lowerPrice: z.number().positive().finite().optional(),
    upperPrice: z.number().positive().finite().optional(),
    /** Symmetric half-width around ATM in bps (used when prices omitted). */
    widthBps: bps.optional(),
  })
  .refine(
    (r) =>
      (r.lowerPrice !== undefined && r.upperPrice !== undefined) ||
      r.widthBps !== undefined,
    { message: "set both lowerPrice & upperPrice, or widthBps" },
  )
  .refine(
    (r) =>
      r.lowerPrice === undefined ||
      r.upperPrice === undefined ||
      r.lowerPrice < r.upperPrice,
    { message: "lowerPrice must be < upperPrice" },
  );
export type RangeBounds = z.infer<typeof RangeBounds>;

const BinaryUpLeg = z.object({
  primitive: z.literal("binary_up"),
  weightPct: pct,
  strike: StrikeSelector,
});

const BinaryDownLeg = z.object({
  primitive: z.literal("binary_down"),
  weightPct: pct,
  strike: StrikeSelector,
});

const RangeLeg = z.object({
  primitive: z.literal("range"),
  weightPct: pct,
  bounds: RangeBounds,
});

const PlpLeg = z.object({
  primitive: z.literal("plp"),
  weightPct: pct,
});

/** An out-of-the-money binary bought as crash insurance. */
const HedgeLeg = z.object({
  primitive: z.literal("hedge"),
  weightPct: pct,
  side: z.enum(["up", "down"]),
  strike: StrikeSelector,
});

export const Allocation = z.discriminatedUnion("primitive", [
  BinaryUpLeg,
  BinaryDownLeg,
  RangeLeg,
  PlpLeg,
  HedgeLeg,
]);
export type Allocation = z.infer<typeof Allocation>;

export const StrategyIR = z
  .object({
    version: z.literal(IR_VERSION),
    name: z.string().min(1).max(80),
    asset: SupportedAsset,
    capital: z.object({
      amount: usd,
      quote: QuoteAsset,
    }),
    // Descriptive metadata only — actual strikes come from `allocations`.
    view: z
      .object({
        kind: z.enum(["range", "directional", "volatility"]),
        bias: z.enum(["up", "down", "neutral"]).optional(),
      })
      .optional(),
    expiry: z.object({
      mode: z.enum(["nearest", "rolling"]),
      /** Preferred horizon in ms; compiler snaps to the nearest live oracle. */
      horizonMs: z.number().int().positive().optional(),
    }),
    risk: z.object({
      maxLossPct: pct,
    }),
    allocations: z.array(Allocation).min(1).max(8),
    rebalance: z
      .object({ everyMs: z.number().int().positive() })
      .optional(),
    autoRoll: z.boolean().optional(),
  })
  .superRefine((ir, ctx) => {
    const total = ir.allocations.reduce((s, a) => s + a.weightPct, 0);
    // allow tiny float error
    if (Math.abs(total - 100) > 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `allocation weights must sum to 100 (got ${total})`,
        path: ["allocations"],
      });
    }
  });

export type StrategyIR = z.infer<typeof StrategyIR>;
