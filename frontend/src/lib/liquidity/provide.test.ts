import { describe, expect, it } from "vitest";
import { calculateProvideLiquidityQuote, displayBaseAmount, formatLpShareBps, ratioAmount } from "./provide";

describe("provide liquidity math", () => {
  it("balances the opposite side to the pool ratio", () => {
    expect(ratioAmount("100", "1000", "2000")).toBe("200");
    expect(displayBaseAmount("1234567", 6)).toBe("1.234567");
  });

  it("estimates LP mint and resulting pool share for proportional deposits", () => {
    const quote = calculateProvideLiquidityQuote({
      depositAmounts: ["100", "200"],
      reserves: ["1000", "2000"],
      totalShare: "500",
    });

    expect(quote).toEqual({
      expectedLpAmount: "50",
      poolShareBps: 909,
      imbalanceBps: 0,
      isProportional: true,
    });
    expect(formatLpShareBps(quote?.poolShareBps ?? 0)).toBe("9.09%");
  });

  it("flags non-proportional deposits", () => {
    const quote = calculateProvideLiquidityQuote({
      depositAmounts: ["100", "100"],
      reserves: ["1000", "2000"],
      totalShare: "500",
    });

    expect(quote?.expectedLpAmount).toBe("25");
    expect(quote?.imbalanceBps).toBe(5000);
    expect(quote?.isProportional).toBe(false);
  });

  it("does not quote empty or uninitialized pools", () => {
    expect(calculateProvideLiquidityQuote({ depositAmounts: ["0", "1"], reserves: ["10", "10"], totalShare: "10" })).toBeNull();
    expect(calculateProvideLiquidityQuote({ depositAmounts: ["1", "1"], reserves: ["0", "10"], totalShare: "10" })).toBeNull();
  });
});
