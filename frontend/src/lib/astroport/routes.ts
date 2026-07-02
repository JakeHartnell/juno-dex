import type { RegistryAsset, RegistryPool } from "../../config/registry";
import type { ExecuteMsg as RouterExecuteMsg, SwapOperation } from "../generated/Router.types";
import { nativeFunds, toAssetInfo } from "./assetInfo";

export type SwapRouteHop = {
  pool: RegistryPool;
  offerAsset: RegistryAsset;
  askAsset: RegistryAsset;
};

export type SwapRoute = {
  id: string;
  hops: SwapRouteHop[];
  operations: SwapOperation[];
};

export function sameAsset(left: RegistryAsset | undefined, right: RegistryAsset | undefined) {
  return Boolean(left && right && left.id === right.id);
}

export function getPoolNeighbor(pool: RegistryPool, assetId: string): RegistryAsset | undefined {
  if (pool.assets[0].id === assetId) return pool.assets[1];
  if (pool.assets[1].id === assetId) return pool.assets[0];
  return undefined;
}

function routeId(hops: SwapRouteHop[]) {
  return hops.map((hop) => `${hop.pool.pair}:${hop.offerAsset.id}->${hop.askAsset.id}`).join("|");
}

export function routeToOperations(hops: SwapRouteHop[]): SwapOperation[] {
  return hops.map((hop) => ({
    astro_swap: {
      offer_asset_info: toAssetInfo(hop.offerAsset),
      ask_asset_info: toAssetInfo(hop.askAsset),
    },
  }));
}

export function findSwapRoutes(pools: RegistryPool[], offerAsset: RegistryAsset | undefined, askAsset: RegistryAsset | undefined, maxHops = 3): SwapRoute[] {
  if (!offerAsset || !askAsset || offerAsset.id === askAsset.id || maxHops < 1) return [];

  const routes: SwapRoute[] = [];
  const seenRoutes = new Set<string>();

  function visit(currentAsset: RegistryAsset, targetAsset: RegistryAsset, hops: SwapRouteHop[], visitedAssets: Set<string>, usedPairs: Set<string>) {
    if (hops.length >= maxHops) return;

    for (const pool of pools) {
      if (!pool.enabled || usedPairs.has(pool.pair)) continue;
      const nextAsset = getPoolNeighbor(pool, currentAsset.id);
      if (!nextAsset || visitedAssets.has(nextAsset.id)) continue;

      const nextHops = [...hops, { pool, offerAsset: currentAsset, askAsset: nextAsset }];
      if (nextAsset.id === targetAsset.id) {
        const id = routeId(nextHops);
        if (!seenRoutes.has(id)) {
          seenRoutes.add(id);
          routes.push({ id, hops: nextHops, operations: routeToOperations(nextHops) });
        }
        continue;
      }

      visit(nextAsset, targetAsset, nextHops, new Set([...visitedAssets, nextAsset.id]), new Set([...usedPairs, pool.pair]));
    }
  }

  visit(offerAsset, askAsset, [], new Set([offerAsset.id]), new Set());
  return routes.sort((a, b) => a.hops.length - b.hops.length || a.id.localeCompare(b.id));
}

export function routeSymbols(route: SwapRoute): string {
  if (route.hops.length === 0) return "—";
  return [route.hops[0].offerAsset.symbol, ...route.hops.map((hop) => hop.askAsset.symbol)].join(" → ");
}

export function createRouterSwapMessage(route: SwapRoute, offerAsset: RegistryAsset, amount: string, maxSpread: string, minimumReceive?: string, to?: string) {
  const msg = {
    execute_swap_operations: {
      operations: route.operations,
      minimum_receive: minimumReceive,
      max_spread: maxSpread,
      to,
    },
  } satisfies RouterExecuteMsg;

  return {
    msg,
    funds: nativeFunds(offerAsset, amount),
  };
}
