import { describe, expect, it } from "vitest";
import type { PoolResponse } from "../generated/Pair.types";
import { calculateLpShareBps, estimateLpPosition, formatPositionSharePercent } from "./position";

const pool: PoolResponse = {
  total_share: "1000000000",
  assets: [
    { info: { native_token: { denom: "ujuno" } }, amount: "5000000000" },
    { info: { native_token: { denom: "factory/pair/token" } }, amount: "10000000000" },
  ],
};

describe("LP position math", () => {
  it("calculates pool ownership in basis points", () => {
    expect(calculateLpShareBps("50000000", pool.total_share)).toBe(500);
    expect(calculateLpShareBps("1", "1000000000")).toBe(0);
    expect(calculateLpShareBps("1000000000", pool.total_share)).toBe(10000);
    expect(calculateLpShareBps(undefined, pool.total_share)).toBe(0);
    expect(calculateLpShareBps("100", "0")).toBe(0);
  });

  it("estimates underlying position assets from wallet LP balance", () => {
    expect(estimateLpPosition(pool, "50000000")).toMatchObject({
      lpBalance: "50000000",
      totalShare: "1000000000",
      shareBps: 500,
      sharePercent: 5,
      hasPosition: true,
      underlyingAssets: [
        { info: { native_token: { denom: "ujuno" } }, amount: "250000000" },
        { info: { native_token: { denom: "factory/pair/token" } }, amount: "500000000" },
      ],
    });
  });

  it("formats LP share percentages for display", () => {
    expect(formatPositionSharePercent(0)).toBe("0%");
    expect(formatPositionSharePercent(1)).toBe("0.01%");
    expect(formatPositionSharePercent(7)).toBe("0.07%");
    expect(formatPositionSharePercent(500)).toBe("5.00%");
    expect(formatPositionSharePercent(10000)).toBe("100.00%");
  });
});
