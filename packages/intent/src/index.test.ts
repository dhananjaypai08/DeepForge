import { describe, it, expect, vi } from "vitest";
import { exampleIR } from "@deepforge/ir";
import { intentToIR } from "./index.js";

function mockResponse(obj: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: "emit_strategy", arguments: JSON.stringify(obj) } },
            ],
          },
        },
      ],
    }),
  } as unknown as Response;
}

describe("intentToIR", () => {
  it("returns a validated IR from a well-formed tool call", async () => {
    const fetchImpl = vi.fn(async () => mockResponse(exampleIR()));
    const { ir } = await intentToIR("BTC stays 118k-120k, risk $30", {
      apiKey: "test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ir.asset).toBe("BTC");
    expect(ir.allocations.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("repairs once when the first attempt is invalid", async () => {
    const bad = { ...exampleIR(), allocations: [{ primitive: "plp", weightPct: 42 }] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse(bad))
      .mockResolvedValueOnce(mockResponse(exampleIR()));
    const { ir } = await intentToIR("range play", {
      apiKey: "test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(ir.allocations.reduce((s, a) => s + a.weightPct, 0)).toBe(100);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting repairs", async () => {
    const bad = { ...exampleIR(), allocations: [{ primitive: "plp", weightPct: 1 }] };
    const fetchImpl = vi.fn(async () => mockResponse(bad));
    await expect(
      intentToIR("nope", {
        apiKey: "test",
        maxRepairs: 1,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/validation/);
  });

  it("errors without an API key", async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await expect(intentToIR("x", {})).rejects.toThrow(/OPENROUTER_API_KEY/);
    if (saved) process.env.OPENROUTER_API_KEY = saved;
  });
});
