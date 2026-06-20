import {
  IR_VERSION,
  irJsonSchema,
  validateIR,
  type StrategyIR,
  type ValidationErr,
} from "@deepforge/ir";

export interface IntentOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Optional live spot price to ground ATM-relative strike selection. */
  spotHint?: number;
  /** Max validation-repair round trips (default 1). */
  maxRepairs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

const TOOL_NAME = "emit_strategy";

function systemPrompt(spotHint?: number): string {
  return [
    "You compile a user's natural-language trading intent into a DeepForge",
    "Financial IR for the DeepBook Predict protocol (binary up/down positions,",
    "vertical ranges, and PLP vault supply). You MUST call the",
    `\`${TOOL_NAME}\` function with a single valid StrategyIR object and nothing else.`,
    "",
    "Rules:",
    `- version must be "${IR_VERSION}". asset is ALWAYS "BTC". capital.quote is "DUSDC".`,
    "- DeepBook Predict testnet only has BTC oracles. If the user names another",
    "  asset (ETH, SOL, etc.), still use BTC and name the strategy with 'BTC' —",
    "  do NOT name it after an unsupported asset.",
    "- allocations[].weightPct MUST sum to exactly 100.",
    "- CRITICAL: do NOT use absolute prices (strike.price, bounds.lowerPrice,",
    "  bounds.upperPrice) UNLESS the user explicitly names a dollar level. For all",
    "  relative/qualitative views use ATM-relative selectors only:",
    "    • range  -> bounds.widthBps, kept SMALL: 'tight'≈25, 'normal'≈45, 'wide'≈75.",
    "      BTC moves <1% in an hour, so a band ≥120 bps is near-certain and the",
    "      protocol CANNOT quote it — never exceed 90.",
    "    • binary -> strike.atmOffsetBps (0 = at-the-money; +above / -below spot),",
    "      kept within ±150 so the strike stays near the forward.",
    "  This keeps strikes on the live oracle grid and prices away from 0/1.",
    "- 'stay in a range' -> one `range` leg. 'big move, unknown direction' ->",
    "  binary_up + binary_down. Directional view -> a single binary_up/binary_down.",
    "- Use `hedge` (an OTM binary) only when the user asks to cap downside.",
    "- Map a stated risk budget to risk.maxLossPct (percentage of capital).",
    "- TESTNET: keep capital.amount very small (default 2 DUSDC; never exceed 25)",
    "  unless the user explicitly names a larger dollar amount to deploy.",
    "- expiry.mode is 'rolling' if the user wants auto-roll, else 'nearest'.",
    "  ALWAYS set expiry.horizonMs — use the user's stated window, or default to",
    "  3600000 (1h). A missing/short horizon picks a near-expiry oracle with ~zero",
    "  vol where every range is certain and unpriceable.",
    spotHint
      ? `- Current BTC spot is ~$${Math.round(spotHint)}. If the user gives an absolute price, it MUST be within ~10% of this; otherwise use relative selectors.`
      : "- You do NOT know the live spot, so you MUST use relative selectors (widthBps / atmOffsetBps), never absolute prices.",
  ]
    .filter(Boolean)
    .join("\n");
}

interface ToolCall {
  function?: { name?: string; arguments?: string };
}

async function callModel(
  text: string,
  schema: Record<string, unknown>,
  opts: IntentOptions,
  repairFeedback?: { previous: string; errors: ValidationErr["errors"] },
): Promise<unknown> {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required for intent parsing (set env or pass opts.apiKey)",
    );
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt(opts.spotHint) },
    { role: "user", content: text },
  ];
  if (repairFeedback) {
    messages.push({
      role: "assistant",
      content: `Previous attempt: ${repairFeedback.previous}`,
    });
    messages.push({
      role: "user",
      content:
        "That object failed validation:\n" +
        repairFeedback.errors.map((e) => `- ${e.path || "(root)"}: ${e.message}`).join("\n") +
        `\nCall ${TOOL_NAME} again with a corrected object.`,
    });
  }

  const res = await doFetch(`${opts.baseUrl ?? DEFAULT_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-title": "DeepForge",
    },
    body: JSON.stringify({
      model: opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
      temperature: 0,
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description: "Emit the compiled StrategyIR for the user's intent.",
            parameters: schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: TOOL_NAME } },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { tool_calls?: ToolCall[]; content?: string } }[];
  };
  const msg = data.choices?.[0]?.message;
  const args = msg?.tool_calls?.[0]?.function?.arguments;
  if (!args) {
    throw new Error("model did not return a tool call with arguments");
  }
  try {
    return JSON.parse(args);
  } catch {
    throw new Error(`model returned non-JSON tool arguments: ${args.slice(0, 200)}`);
  }
}

export interface IntentResult {
  ir: StrategyIR;
  /** Raw object returned by the model, before validation (for debugging). */
  raw: unknown;
}

/**
 * Compile natural-language intent into a validated StrategyIR via OpenRouter.
 * The LLM only extracts intent into the typed schema; all financial logic
 * downstream is deterministic. Invalid output triggers a bounded repair loop and
 * then a hard error — we never silently fabricate a strategy.
 */
export async function intentToIR(
  text: string,
  opts: IntentOptions = {},
): Promise<IntentResult> {
  const schema = irJsonSchema();
  const maxRepairs = opts.maxRepairs ?? 1;

  let raw = await callModel(text, schema, opts);
  let result = validateIR(raw);
  let attempts = 0;
  while (!result.ok && attempts < maxRepairs) {
    attempts++;
    raw = await callModel(text, schema, opts, {
      previous: JSON.stringify(raw),
      errors: result.errors,
    });
    result = validateIR(raw);
  }
  if (!result.ok) {
    throw new Error(
      "intent parsing failed validation after repairs:\n" +
        result.errors.map((e) => `- ${e.path || "(root)"}: ${e.message}`).join("\n"),
    );
  }
  return { ir: result.ir, raw };
}
