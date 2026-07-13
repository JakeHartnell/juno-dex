import { describe, expect, it } from "vitest";
import { aggregateSwapsToCandles, bucketStartFor, deriveCanonicalSwapPrice } from "../src/candles.js";

describe("candle helpers", () => {
  it("buckets timestamps for supported intervals", () => {
    expect(bucketStartFor("2026-07-02T12:34:56.000Z", "5m")).toBe("2026-07-02T12:30:00.000Z");
    expect(bucketStartFor("2026-07-02T12:34:56.000Z", "1h")).toBe("2026-07-02T12:00:00.000Z");
    expect(bucketStartFor("2026-07-02T12:34:56.000Z", "1d")).toBe("2026-07-02T00:00:00.000Z");
  });

  it("derives a deterministic decimals-aware price regardless of swap direction", () => {
    expect(deriveCanonicalSwapPrice({ pairAddress: "juno1pair", blockTime: "2026-07-02T12:00:00Z", offerAsset: "ujuno", offerAmount: "1000000", askAsset: "uusdc", returnAmount: "1250000" }, { ujuno: 6, uusdc: 6 })).toMatchObject({
      baseAsset: "ujuno",
      quoteAsset: "uusdc",
      price: "1.25",
      volume: "1",
      volumeQuote: "1.25",
    });
    expect(deriveCanonicalSwapPrice({ pairAddress: "juno1pair", blockTime: "2026-07-02T12:01:00Z", offerAsset: "uusdc", offerAmount: "2500000", askAsset: "ujuno", returnAmount: "2000000" }, { ujuno: 6, uusdc: 6 })).toMatchObject({
      baseAsset: "ujuno",
      quoteAsset: "uusdc",
      price: "1.25",
      volume: "2",
      volumeQuote: "2.5",
    });
  });

  it("aggregates swaps into OHLC candles", () => {
    const candles = aggregateSwapsToCandles([
      { pairAddress: "juno1pair", blockTime: "2026-07-02T12:01:00Z", offerAsset: "ujuno", offerAmount: "1000000", askAsset: "uusdc", returnAmount: "1000000" },
      { pairAddress: "juno1pair", blockTime: "2026-07-02T12:10:00Z", offerAsset: "ujuno", offerAmount: "1000000", askAsset: "uusdc", returnAmount: "1200000" },
      { pairAddress: "juno1pair", blockTime: "2026-07-02T12:20:00Z", offerAsset: "uusdc", offerAmount: "900000", askAsset: "ujuno", returnAmount: "1000000" },
    ], "1h", { ujuno: 6, uusdc: 6 });

    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({
      bucketStart: "2026-07-02T12:00:00.000Z",
      open: "1",
      high: "1.19999999999999996",
      low: "0.900000000000000022",
      close: "0.900000000000000022",
      tradeCount: 3,
      volume: "3",
    });
  });
});
