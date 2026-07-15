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
  it("keeps the route inside the collapsed details and marks values so long text can wrap", () => {
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
    expect(routeLabel?.closest("details")).toBeTruthy();
    expect(screen.getByText(/JUNO → JUNOAGENT-TEST/i).closest("dd")?.className).toBe("quote-row-value route-value");
  });

  it("shows the rate as the only always-visible line and collapses the detail rows", () => {
    const pool = dexRegistry.pools[0];
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

    render(<QuoteCard quote={quote} offerAsset={pool.assets[0]} askAsset={pool.assets[1]} isLoading={false} slippageBps={50} />);

    const details = document.querySelector("details.quote-disclosure");
    expect(details).toBeTruthy();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText(/^1 JUNO = /)).toBeTruthy();
    expect(screen.getByText("Max slippage").closest("details")).toBe(details);
    expect(screen.queryByText("Quote status")).toBeNull();
  });

  it("reports the effective slippage read-only; the gear is the only place to change it", () => {
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

    render(<QuoteCard quote={quote} offerAsset={pool.assets[0]} askAsset={pool.assets[1]} isLoading={false} slippageBps={237} />);

    expect(screen.getByText("2.37%")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /max slippage preset/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "0.5%" })).toBeNull();
  });
});
