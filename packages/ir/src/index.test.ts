import { describe, it, expect } from "vitest";
import {
  validateIR,
  parseDeepforgeFile,
  serializeDeepforgeFile,
  fmtDeepforgeFile,
  hashIR,
  exampleIR,
  irJsonSchema,
} from "./index.js";

describe("IR validation", () => {
  it("accepts a valid example", () => {
    const res = validateIR(exampleIR());
    expect(res.ok).toBe(true);
  });

  it("rejects allocations that do not sum to 100", () => {
    const ir = exampleIR();
    ir.allocations = [{ primitive: "plp", weightPct: 50 }];
    const res = validateIR(ir);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => /sum to 100/.test(e.message))).toBe(true);
    }
  });

  it("rejects a binary leg with two strike selectors", () => {
    const res = validateIR({
      ...exampleIR(),
      allocations: [
        {
          primitive: "binary_up",
          weightPct: 100,
          strike: { price: 119000, atmOffsetBps: 100 },
        },
      ],
    });
    expect(res.ok).toBe(false);
  });

  it("rejects a range with lower >= upper", () => {
    const res = validateIR({
      ...exampleIR(),
      allocations: [
        {
          primitive: "range",
          weightPct: 100,
          bounds: { lowerPrice: 120000, upperPrice: 118000 },
        },
      ],
    });
    expect(res.ok).toBe(false);
  });
});

describe("DeepForge file round-trip", () => {
  it("serialize -> parse is identity (canonical)", () => {
    const ir = exampleIR();
    const yaml = serializeDeepforgeFile(ir);
    const back = parseDeepforgeFile(yaml);
    expect(back).toEqual(ir);
  });

  it("fmt is idempotent", () => {
    const yaml = serializeDeepforgeFile(exampleIR());
    expect(fmtDeepforgeFile(yaml)).toBe(fmtDeepforgeFile(fmtDeepforgeFile(yaml)));
  });

  it("hash is stable regardless of key order", () => {
    const a = exampleIR();
    const b = JSON.parse(JSON.stringify(a));
    // reorder top-level keys
    const reordered = {
      allocations: b.allocations,
      risk: b.risk,
      capital: b.capital,
      asset: b.asset,
      name: b.name,
      version: b.version,
      expiry: b.expiry,
      view: b.view,
      autoRoll: b.autoRoll,
    };
    expect(hashIR(a)).toBe(hashIR(reordered as typeof a));
  });

  it("parse rejects invalid YAML content", () => {
    expect(() => parseDeepforgeFile("allocations: [")).toThrow();
  });
});

describe("JSON schema export", () => {
  it("produces an object schema for the LLM tool", () => {
    const schema = irJsonSchema() as { type?: string };
    expect(schema).toBeTruthy();
    // zod-to-json-schema wraps under $ref/definitions; just assert it's an object
    expect(typeof schema).toBe("object");
  });
});
