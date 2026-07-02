import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dexRegistry } from "../../config/registry";
import type { RouteQuote } from "../../queries/useSwapQuote";
import { QuoteCard } from "./QuoteCard";

describe("QuoteCard layout", () => {
  it("marks quote details so long values can wrap inside the card", () => {
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

    const details = screen.getByText("Return").closest("dl");
    expect(details?.className).toBe("quote-details");
    expect(screen.getByText(pool.pair).closest("dd")?.className).toBe("quote-detail-value");
  });

  it("renders stable/PCL contract-simulation caveats instead of claiming local invariant math", () => {
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

    expect(screen.getAllByText(/contract-simulated/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Stable pool math is not recomputed locally/i)).toBeTruthy();
  });
});
