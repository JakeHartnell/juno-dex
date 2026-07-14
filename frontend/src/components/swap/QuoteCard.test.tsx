import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { dexRegistry } from "../../config/registry";
import type { RouteQuote } from "../../queries/useSwapQuote";
import { QuoteCard } from "./QuoteCard";

vi.mock("../../queries/usePools", () => ({
  usePoolCandles: () => ({
    data: [],
    access: { source: "indexer", isFallback: false, isMock: false, isStale: false },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

describe("QuoteCard layout", () => {
  it("shows the route inline and marks values so long text can wrap inside the card", () => {
    const pool = dexRegistry.pools[0];
    const askAsset = pool.assets[1];
    const quote: RouteQuote = {
      offer_amount: "1000000",
      return_amount: "123456789012345678901234567890",
      spread_amount: "12345678901234567890",
      commission_amount: "12345678901234567890",
      source: "pair",
      mode: "exact-in",
      route: {
        id: "direct",
        hops: [{ pool, offerAsset: pool.assets[0], askAsset: pool.assets[1] }],
        operations: [],
      },
    };

    render(<QuoteCard quote={quote} askAsset={askAsset} isLoading={false} slippageBps={50} />);

    const routeLabel = screen.getAllByText("Route").find((element) => element.tagName === "DT");
    expect(routeLabel?.closest("dl")?.className).toBe("quote-rows");
    expect(screen.getByText(/JUNO → JUNOAGENT-TEST/i).closest("dd")?.className).toBe("quote-row-value route-value");
  });

  it("renders the compact inline quote rows without an expandable details panel", () => {
    const pool = { ...dexRegistry.pools[0], type: "stable" as const };
    const askAsset = pool.assets[1];
    const quote: RouteQuote = {
      offer_amount: "1000000",
      return_amount: "1000000",
      spread_amount: "1000",
      commission_amount: "500",
      source: "pair",
      mode: "exact-in",
      route: {
        id: "stable-direct",
        hops: [{ pool, offerAsset: pool.assets[0], askAsset: pool.assets[1] }],
        operations: [],
      },
    };

    render(<QuoteCard quote={quote} askAsset={askAsset} isLoading={false} slippageBps={50} />);

    expect(screen.getByText("Rate")).toBeTruthy();
    expect(screen.getByText("Max slippage")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /quote details/i })).toBeNull();
    expect(screen.queryByText("Network fee")).toBeNull();
  });

  it("always exposes the effective custom slippage value alongside presets", () => {
    const pool = dexRegistry.pools[0];
    const quote: RouteQuote = {
      offer_amount: "1000000",
      return_amount: "990000",
      spread_amount: "1000",
      commission_amount: "500",
      source: "pair",
      mode: "exact-in",
      route: { id: "direct", hops: [{ pool, offerAsset: pool.assets[0], askAsset: pool.assets[1] }], operations: [] },
    };

    render(<QuoteCard quote={quote} offerAsset={pool.assets[0]} askAsset={pool.assets[1]} isLoading={false} slippageBps={237} onSlippageBps={vi.fn()} />);

    expect(screen.getByLabelText("Current max slippage 2.37%")).toBeTruthy();
    expect(screen.getByRole("group", { name: /max slippage preset/i })).toBeTruthy();
  });
});
