import { describe, it, expect } from "vitest";
import {
  priceToScaled,
  scaledToPrice,
  dollarsToBaseUnits,
  baseUnitsToDollars,
} from "./market.js";
import { deploymentFor, predictTargets } from "./index.js";

describe("scaling helpers", () => {
  it("price round-trips through FLOAT_SCALING", () => {
    expect(scaledToPrice(priceToScaled(119000))).toBeCloseTo(119000, 6);
    expect(priceToScaled(65400)).toBe(65_400_000_000_000n);
  });

  it("dollars round-trip through 6-decimal base units", () => {
    expect(dollarsToBaseUnits(50)).toBe(50_000_000n);
    expect(baseUnitsToDollars(49_640_000n)).toBeCloseTo(49.64, 6);
  });
});

describe("deployment", () => {
  it("exposes verified testnet ids and derived targets", () => {
    const d = deploymentFor("testnet");
    expect(d.predictPackageId).toMatch(/^0x[0-9a-f]+$/);
    expect(d.dusdcType.endsWith("::dusdc::DUSDC")).toBe(true);
    expect(d.plpType.endsWith("::plp::PLP")).toBe(true);
    const t = predictTargets(d.predictPackageId);
    expect(t.mint.endsWith("::predict::mint")).toBe(true);
    expect(t.marketKeyUp.endsWith("::market_key::up")).toBe(true);
  });
});
