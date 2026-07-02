import { describe, expect, it } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { getPoolTypeLabel, getPoolTypeMetadata, hasCaveatedLocalMath } from "./poolTypes";

const basePool: RegistryPool = {
  id: "pool",
  label: "AAA / BBB",
  pair: "juno1pair",
  lpToken: "factory/juno1pair/lp",
  type: "xyk",
  feeBps: 30,
  assets: [
    { kind: "native", id: "uaaa", symbol: "AAA", decimals: 6 },
    { kind: "native", id: "ubbb", symbol: "BBB", decimals: 6 },
  ],
  explorer: "https://example.com/pair",
  enabled: true,
};

describe("pool type metadata", () => {
  it("classifies XYK as locally supported for proportional liquidity math", () => {
    const metadata = getPoolTypeMetadata("xyk");
    expect(metadata.shortLabel).toBe("XYK");
    expect(metadata.supportsLocalPriceImpact).toBe(true);
    expect(metadata.supportsProvideLiquidity).toBe(true);
    expect(hasCaveatedLocalMath(basePool)).toBe(false);
  });

  it("classifies stableswap and PCL as contract-simulated with caveated local liquidity math", () => {
    const stable = getPoolTypeMetadata("stable");
    const concentrated = getPoolTypeMetadata("concentrated");

    expect(getPoolTypeLabel("stable")).toBe("Stable");
    expect(stable.supportsSwapSimulation).toBe(true);
    expect(stable.supportsProvideLiquidity).toBe(false);
    expect(stable.supportsLocalPriceImpact).toBe(false);
    expect(concentrated.shortLabel).toBe("PCL");
    expect(concentrated.supportsProvideSimulation).toBe(false);
    expect(hasCaveatedLocalMath({ ...basePool, type: "stable" })).toBe(true);
    expect(hasCaveatedLocalMath({ ...basePool, type: "concentrated" })).toBe(true);
  });
});
