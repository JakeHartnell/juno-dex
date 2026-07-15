import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { queryReverseSwapSimulation, queryRouterReverseSimulation, queryRouterSimulation, querySwapSimulation, type SwapQuoteMode } from "../lib/astroport/queries";
import { findSwapRoutes, type SwapRoute } from "../lib/astroport/routes";

export const SWAP_QUOTE_DEBOUNCE_MS = 300;
export const SWAP_QUOTE_TTL_MS = 30_000;
export const SWAP_QUOTE_REFRESH_INTERVAL_MS = 15_000;

export type RouteQuote = {
  route: SwapRoute;
  offer_amount: string;
  return_amount: string;
  spread_amount: string;
  commission_amount: string;
  source: "pair" | "router";
  mode: SwapQuoteMode;
  previewUnavailable?: boolean;
  errors?: string[];
};

function isPositiveAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debouncedValue;
}

async function quoteRoute(route: SwapRoute, amount: string, mode: SwapQuoteMode): Promise<RouteQuote> {
  if (route.hops.length === 1) {
    const [hop] = route.hops;
    if (mode === "exact-out") {
      const quote = await queryReverseSwapSimulation(hop.pool.pair, hop.offerAsset, hop.askAsset, amount);
      return { route, source: "pair", mode, offer_amount: quote.offer_amount, return_amount: amount, spread_amount: quote.spread_amount, commission_amount: quote.commission_amount };
    }
    const quote = await querySwapSimulation(hop.pool.pair, hop.offerAsset, hop.askAsset, amount);
    return { route, source: "pair", mode, offer_amount: amount, ...quote };
  }

  if (mode === "exact-out") {
    const quote = await queryRouterReverseSimulation(route.operations, amount);
    return { route, source: "router", mode, offer_amount: quote.amount, return_amount: amount, spread_amount: "0", commission_amount: "0" };
  }

  const quote = await queryRouterSimulation(route.operations, amount);
  return { route, source: "router", mode, offer_amount: amount, return_amount: quote.amount, spread_amount: "0", commission_amount: "0" };
}

export function selectBestRouteQuote(quotes: RouteQuote[], mode: SwapQuoteMode = "exact-in"): RouteQuote | undefined {
  return [...quotes].sort((a: RouteQuote, b: RouteQuote) => {
    if (mode === "exact-out") {
      const inputDiff = BigInt(a.offer_amount) - BigInt(b.offer_amount);
      if (inputDiff > 0n) return 1;
      if (inputDiff < 0n) return -1;
    } else {
      const outputDiff = BigInt(b.return_amount) - BigInt(a.return_amount);
      if (outputDiff > 0n) return 1;
      if (outputDiff < 0n) return -1;
    }
    return a.route.hops.length - b.route.hops.length;
  })[0];
}

export function useSwapQuote(pools: RegistryPool[], offerAsset: RegistryAsset | undefined, askAsset: RegistryAsset | undefined, amount: string, mode: SwapQuoteMode = "exact-in", maxHops = 3) {
  const debouncedAmount = useDebouncedValue(amount, SWAP_QUOTE_DEBOUNCE_MS);
  const query = useQuery({
    queryKey: ["swap-route-quote", mode, pools.map((pool) => pool.pair).join(","), offerAsset?.id, askAsset?.id, debouncedAmount, maxHops],
    enabled: Boolean(pools.length && offerAsset && askAsset && isPositiveAmount(debouncedAmount)),
    queryFn: async () => {
      const routes = findSwapRoutes(pools, offerAsset, askAsset, maxHops);
      if (routes.length === 0) throw new Error("No route found for this token pair");

      const attempts = await Promise.allSettled(routes.map((route) => quoteRoute(route, debouncedAmount, mode)));
      const quotes = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? [attempt.value] : []);
      const errors = attempts.flatMap((attempt) => attempt.status === "rejected" ? [attempt.reason instanceof Error ? attempt.reason.message : String(attempt.reason)] : []);
      const best = selectBestRouteQuote(quotes, mode);
      if (!best) throw new Error(errors.length ? `Route preview unavailable: ${errors.join("; ")}` : "Route preview unavailable");
      return { ...best, errors: errors.length ? errors : undefined };
    },
    staleTime: SWAP_QUOTE_TTL_MS,
    refetchInterval: SWAP_QUOTE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const quoteUpdatedAt = query.dataUpdatedAt || 0;
  const [isExpired, setIsExpired] = useState(false);

  // One timer per quote, firing once at its TTL. A repeating tick here would
  // re-render every consumer of this hook once a second for the whole session.
  useEffect(() => {
    if (!quoteUpdatedAt) {
      setIsExpired(false);
      return;
    }
    const remainingMs = quoteUpdatedAt + SWAP_QUOTE_TTL_MS - Date.now();
    if (remainingMs <= 0) {
      setIsExpired(true);
      return;
    }
    setIsExpired(false);
    const timer = window.setTimeout(() => setIsExpired(true), remainingMs);
    return () => window.clearTimeout(timer);
  }, [quoteUpdatedAt]);

  const isDebouncing = amount !== debouncedAmount;

  return useMemo(() => ({
    ...query,
    debouncedAmount,
    isDebouncing,
    quoteUpdatedAt,
    isExpired,
    refreshQuote: query.refetch,
  }), [query, debouncedAmount, isDebouncing, quoteUpdatedAt, isExpired]);
}
