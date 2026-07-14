import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { PriceCandleChart } from "./PriceCandleChart";

const mocks = vi.hoisted(() => ({
  usePoolCandles: vi.fn(),
}));

vi.mock("../../queries/usePools", () => ({
  usePoolCandles: mocks.usePoolCandles,
}));

const pool: RegistryPool = {
  id: "juno-usdc",
  label: "JUNO / USDC",
  pair: "juno1chartpool",
  lpToken: "factory/juno1chartpool/astroport/share",
  type: "xyk",
  feeBps: 30,
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", name: "Juno", decimals: 6, logoURI: "https://example.com/juno.svg", verified: true },
    { kind: "ibc", id: "ibc/usdc", symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: "https://example.com/usdc.svg", verified: true },
  ],
  explorer: "https://example.com/pool",
  enabled: true,
  status: "active",
  verified: true,
  source: "registry",
};

const candles = [
  { poolId: pool.pair, pairAddress: pool.pair, baseAsset: "ujuno", quoteAsset: "ibc/usdc", interval: "1h", bucketStart: "2026-07-02T00:00:00.000Z", open: 1, high: 1.2, low: 0.9, close: 1.1, volume: 10, volumeQuote: 11, tradeCount: 2, dataSource: "indexer", isMock: false },
  { poolId: pool.pair, pairAddress: pool.pair, baseAsset: "ujuno", quoteAsset: "ibc/usdc", interval: "1h", bucketStart: "2026-07-02T01:00:00.000Z", open: 1.1, high: 1.4, low: 1.05, close: 1.3, volume: 12, volumeQuote: 15, tradeCount: 3, dataSource: "indexer", isMock: false },
];

describe("PriceCandleChart", () => {
  beforeEach(() => {
    mocks.usePoolCandles.mockReturnValue({
      data: candles,
      access: { source: "indexer", isFallback: false, isMock: false, isStale: false, updatedAt: candles[1].bucketStart },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders a swap-style chart with axes, units, and hover point labels", () => {
    render(<PriceCandleChart pool={pool} />);

    expect(screen.getByRole("heading", { name: "Price chart" })).toBeTruthy();
    expect(screen.getByTestId("price-candle-svg")).toBeTruthy();
    expect(screen.queryByText(/Live data/i)).toBeNull();
    expect(screen.getByText(/Price \(USDC\)/i)).toBeTruthy();
    expect(screen.getAllByText("1.3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1.44")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "High" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Low" })).toBeTruthy();
    expect(screen.getAllByText(/Jul 2/i).length).toBeGreaterThanOrEqual(1);

    const chart = screen.getByRole("img", { name: /latest 1.3 USDC/i });
    expect(chart.getAttribute("tabindex")).toBe("0");
    expect(screen.getByText("Accessible price summary")).toBeTruthy();
    fireEvent.mouseEnter(document.querySelector('[data-point-label*="close 1.3 USDC"]') as Element);

    expect(screen.getByText("1.3 USDC")).toBeTruthy();
  });

  it("keeps fallback-range implementation details out of the trader chart", () => {
    mocks.usePoolCandles.mockReturnValueOnce({
      data: candles,
      access: { source: "indexer", isFallback: false, isMock: false, isStale: true, updatedAt: candles[1].bucketStart, rangeFallback: true },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<PriceCandleChart pool={pool} />);

    expect(screen.getByText(/Last available/i)).toBeTruthy();
    expect(screen.queryByText(/candles/i)).toBeNull();
  });

  it("shows honest empty and unavailable states without fake candles", () => {
    mocks.usePoolCandles.mockReturnValueOnce({
      data: [],
      access: { source: "indexer", isFallback: false, isMock: false, isStale: false },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<PriceCandleChart pool={pool} />);

    expect(screen.getByText(/No price history yet/i)).toBeTruthy();
    expect(screen.getByText(/Trading and pool actions are unaffected/i)).toBeTruthy();
  });

  it("keeps optional price-history failures quiet and retryable", () => {
    const refetch = vi.fn();
    mocks.usePoolCandles.mockReturnValueOnce({
      data: [],
      access: { source: "fallback", isFallback: true, isMock: false, isStale: false, error: { code: "network", message: "offline" } },
      isLoading: false,
      isFetching: false,
      refetch,
    });
    render(<PriceCandleChart pool={pool} />);

    expect(screen.getByText("Price history is unavailable")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByText("More information"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("does not expose mock or stale source labels for preview candles", () => {
    mocks.usePoolCandles.mockReturnValueOnce({
      data: candles.map((candle) => ({ ...candle, dataSource: "mock", isMock: true })),
      access: { source: "mock", isFallback: false, isMock: true, isStale: true, updatedAt: candles[1].bucketStart },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<PriceCandleChart pool={pool} />);

    expect(screen.queryByText(/mock candles/i)).toBeNull();
    expect(screen.queryByText(/^stale$/i)).toBeNull();
    expect(screen.queryByText(/Preview data/i)).toBeNull();
  });

  it("passes selected interval and range to the candle query", () => {
    render(<PriceCandleChart pool={pool} />);

    fireEvent.click(within(screen.getByLabelText("Candle interval")).getByRole("button", { name: "5m" }));
    fireEvent.click(within(screen.getByLabelText("Chart range")).getByRole("button", { name: "30d" }));

    expect(mocks.usePoolCandles).toHaveBeenLastCalledWith(pool, { interval: "5m", range: "30d", limit: 200 });
  });

  it("renders a compact sparkline without interval controls", () => {
    render(<PriceCandleChart pool={pool} title="Route price" compact />);

    expect(screen.getByRole("heading", { name: "Route price" })).toBeTruthy();
    expect(screen.queryByLabelText("Candle interval")).toBeNull();
    expect(mocks.usePoolCandles).toHaveBeenCalledWith(pool, { interval: "1h", range: "24h", limit: 40 });
  });
});
