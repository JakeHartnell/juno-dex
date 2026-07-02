import { describe, expect, it } from "vitest";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount, toBaseAmount } from "./amounts";

describe("amount formatting", () => {
  it("parses zero without floating point math", () => {
    expect(parseTokenAmount("0", 6)).toMatchObject({ isValid: true, baseAmount: "0" });
    expect(toBaseAmount("0.000000", 6)).toBe("0");
  });

  it("parses tiny decimal-safe amounts", () => {
    expect(toBaseAmount("0.000001", 6)).toBe("1");
    expect(toBaseAmount("0.000000000000000001", 18)).toBe("1");
  });

  it("parses huge values as strings", () => {
    expect(toBaseAmount("12345678901234567890.123456", 6)).toBe("12345678901234567890123456");
    expect(formatAmount("12345678901234567890123456", 6, 6)).toBe("12,345,678,901,234,567,890.123456");
  });

  it("rejects invalid inputs", () => {
    expect(parseTokenAmount("1.2.3", 6).isValid).toBe(false);
    expect(parseTokenAmount("abc", 6).isValid).toBe(false);
    expect(parseTokenAmount("0.0000001", 6).isValid).toBe(false);
    expect(toBaseAmount("abc", 6)).toBe("0");
  });

  it("compares balances as bigint-safe base amounts", () => {
    expect(isBaseAmountGreaterThan("1000001", "1000000")).toBe(true);
    expect(isBaseAmountGreaterThan("999999", "1000000")).toBe(false);
  });
});
