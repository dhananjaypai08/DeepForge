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
const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";

const TOOL_NAME = "emit_strategy";

function systemPrompt(spotHint?: number): string {
  return [
    "You compile a user's natural-language trading intent into a DeepForge",
    "Financial IR for the DeepBook Predict protocol (binary up/down positions,",
    "vertical ranges, and PLP vault supply). You MUST call the",
    `\`${TOOL_NAME}\` function with a single valid StrategyIR object and nothing else.`,
    "",
    "Rules:",
    `- version must be "${IR_VERSION}". asset is "BTC". capital.quote is "DUSDC".`,
    "- allocations[].weightPct MUST sum to exactly 100.",
    "- Prefer ATM-relative strikes via strike.atmOffsetBps or strike.atmSigma when",
    "  the user gives a directional/relative view; use strike.price only when the",
    "  user names an absolute price level.",
    "- For a 'stay between X and Y' view use a single `range` allocation with",
    "  bounds.lowerPrice / bounds.upperPrice. For a volatility (big-move, unknown",
    "  direction) view, combine binary_up and binary_down legs.",
    "- Use `hedge` (an OTM binary) only when the user asks to cap downside.",
    "- Map a stated risk budget to risk.maxLossPct (percentage of capital).",
    "- expiry.mode is 'rolling' if the user wants auto-roll, else 'nearest';",
    "  set expiry.horizonMs from any stated time window.",
    spotHint ? `- Current BTC spot is approximately $${spotHint}.` : "",
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
