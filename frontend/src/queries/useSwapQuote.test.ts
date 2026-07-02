import { describe, expect, it } from "vitest";
import { selectBestRouteQuote, type RouteQuote } from "./useSwapQuote";
import type { SwapRoute } from "../lib/astroport/routes";

function quote(returnAmount: string, hops: number): RouteQuote {
  return {
    return_amount: returnAmount,
    spread_amount: "0",
    commission_amount: "0",
    source: hops === 1 ? "pair" : "router",
    route: { id: `${returnAmount}-${hops}`, hops: Array.from({ length: hops }) as SwapRoute["hops"], operations: [] },
  };
}

describe("selectBestRouteQuote", () => {
  it("selects the highest output across direct and router quotes", () => {
    expect(selectBestRouteQuote([quote("100", 1), quote("125", 2), quote("110", 3)])?.return_amount).toBe("125");
  });

  it("uses the shorter route as a tie-breaker", () => {
    expect(selectBestRouteQuote([quote("100", 3), quote("100", 1)])?.route.hops).toHaveLength(1);
  });
});
