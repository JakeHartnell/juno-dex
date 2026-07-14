import { describe, expect, it } from "vitest";
import {
  calculateMinimumReceived,
  calculatePriceImpactBps,
  clampSlippageBps,
  classifyPriceImpact,
  formatBpsPercent,
  slippageBpsToMaxSpread,
  slippagePercentToBps,
} from "./slippage";

describe("slippage math", () => {
  it("calculates minimum received with integer base amounts", () => {
    expect(calculateMinimumReceived("1000000", 50)).toBe("995000");
    expect(calculateMinimumReceived("123456789", 10)).toBe("123333332");
    expect(calculateMinimumReceived("1", 50)).toBe("0");
  });

  it("converts selected slippage to max_spread decimals", () => {
    expect(slippageBpsToMaxSpread(10)).toBe("0.001");
    expect(slippageBpsToMaxSpread(50)).toBe("0.005");
    expect(slippageBpsToMaxSpread(100)).toBe("0.01");
    expect(slippagePercentToBps(0.25)).toBe(25);
  });

  it("clamps legacy stored 50% slippage to the 5% safety ceiling", () => {
    expect(clampSlippageBps(5_000)).toBe(500);
    expect(slippagePercentToBps(50)).toBe(500);
  });
});

describe("price impact math", () => {
  it("derives price impact from quote spread and return amount", () => {
    expect(calculatePriceImpactBps({ spreadAmount: "100", returnAmount: "9900" })).toBe(100);
    expect(calculatePriceImpactBps({ spreadAmount: "526", returnAmount: "9474" })).toBe(526);
    expect(formatBpsPercent(526)).toBe("5.26%");
  });

  it("classifies warning and high price impact thresholds", () => {
    expect(classifyPriceImpact(null)).toBe("none");
    expect(classifyPriceImpact(99)).toBe("none");
    expect(classifyPriceImpact(100)).toBe("warning");
    expect(classifyPriceImpact(499)).toBe("warning");
    expect(classifyPriceImpact(500)).toBe("high");
    expect(classifyPriceImpact(1_499)).toBe("high");
    expect(classifyPriceImpact(1_500)).toBe("extreme");
  });
});
