import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { dexRegistry } from "../../config/registry";
import type { SimulationResponse } from "../../lib/astroport/queries";
import { QuoteCard } from "./QuoteCard";

describe("QuoteCard layout", () => {
  it("marks quote details so long values can wrap inside the card", () => {
    const pool = dexRegistry.pools[0];
    const askAsset = pool.assets[1];
    const quote: SimulationResponse = {
      return_amount: "123456789012345678901234567890",
      spread_amount: "12345678901234567890",
      commission_amount: "12345678901234567890",
    };

    render(<QuoteCard quote={quote} askAsset={askAsset} isLoading={false} pool={pool} slippageBps={50} />);

    const details = screen.getByText("Return").closest("dl");
    expect(details?.className).toBe("quote-details");
    expect(screen.getByText(pool.pair).closest("dd")?.className).toBe("quote-detail-value");
  });
});
