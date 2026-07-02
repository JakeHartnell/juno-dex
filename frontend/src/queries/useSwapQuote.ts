import { useQuery } from "@tanstack/react-query";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { queryRouterSimulation, querySwapSimulation } from "../lib/astroport/queries";
import { findSwapRoutes, type SwapRoute } from "../lib/astroport/routes";

export type RouteQuote = {
  route: SwapRoute;
  return_amount: string;
  spread_amount: string;
  commission_amount: string;
  source: "pair" | "router";
  previewUnavailable?: boolean;
  errors?: string[];
};

function isPositiveAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

async function quoteRoute(route: SwapRoute, amount: string): Promise<RouteQuote> {
  if (route.hops.length === 1) {
    const [hop] = route.hops;
    const quote = await querySwapSimulation(hop.pool.pair, hop.offerAsset, hop.askAsset, amount);
    return { route, source: "pair", ...quote };
  }

  const quote = await queryRouterSimulation(route.operations, amount);
  return {
    route,
    source: "router",
    return_amount: quote.amount,
    spread_amount: "0",
    commission_amount: "0",
  };
}

export function selectBestRouteQuote(quotes: RouteQuote[]): RouteQuote | undefined {
  return [...quotes].sort((a: RouteQuote, b: RouteQuote) => {
    const outputDiff = BigInt(b.return_amount) - BigInt(a.return_amount);
    if (outputDiff > 0n) return 1;
    if (outputDiff < 0n) return -1;
    return a.route.hops.length - b.route.hops.length;
  })[0];
}

export function useSwapQuote(pools: RegistryPool[], offerAsset: RegistryAsset | undefined, askAsset: RegistryAsset | undefined, amount: string, maxHops = 3) {
  return useQuery({
    queryKey: ["swap-route-quote", pools.map((pool) => pool.pair).join(","), offerAsset?.id, askAsset?.id, amount, maxHops],
    enabled: Boolean(pools.length && offerAsset && askAsset && isPositiveAmount(amount)),
    queryFn: async () => {
      const routes = findSwapRoutes(pools, offerAsset, askAsset, maxHops);
      if (routes.length === 0) throw new Error("No route found for this token pair");

      const attempts = await Promise.allSettled(routes.map((route) => quoteRoute(route, amount)));
      const quotes = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? [attempt.value] : []);
      const errors = attempts.flatMap((attempt) => attempt.status === "rejected" ? [attempt.reason instanceof Error ? attempt.reason.message : String(attempt.reason)] : []);
      const best = selectBestRouteQuote(quotes);
      if (!best) throw new Error(errors.length ? `Route preview unavailable: ${errors.join("; ")}` : "Route preview unavailable");
      return { ...best, errors: errors.length ? errors : undefined };
    },
  });
}
