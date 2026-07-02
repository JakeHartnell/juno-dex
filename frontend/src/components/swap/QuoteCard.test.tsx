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
      return_amount: "123456789012345678901234567890",
      spread_amount: "12345678901234567890",
      commission_amount: "12345678901234567890",
      source: "pair",
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
});
