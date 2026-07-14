import { useQueries, useQuery } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import type { SwapRoute } from "../lib/astroport/routes";
import { queryPairPool } from "../lib/astroport/queries";
import { loadPoolActivity, loadPoolCandles, loadPoolMetrics, loadStatsDashboard, loadWalletIndexerData, type DataAccessState, type PoolCandleRange } from "../lib/data-access/indexerFallback";
import type { IndexerCandleInterval } from "../lib/indexer/types";
import type { PoolMetricsByPair } from "../lib/pools/poolList";
import type { StatsDashboardData } from "../lib/stats/dashboard";

export function usePoolReserves(pool: RegistryPool | undefined) {
  return useQuery({
    queryKey: ["pool", pool?.pair],
    enabled: Boolean(pool),
    queryFn: async () => {
      if (!pool) throw new Error("pool is required");
      return queryPairPool(pool.pair);
    },
  });
}

export function useRouteReserves(route: SwapRoute | undefined) {
  const queries = useQueries({
    queries: (route?.hops ?? []).map((hop) => ({
      queryKey: ["pool", hop.pool.pair],
      queryFn: () => queryPairPool(hop.pool.pair),
      staleTime: 15_000,
    })),
  });

  return Object.fromEntries(
    (route?.hops ?? []).flatMap((hop, index) => queries[index]?.data ? [[hop.pool.pair, queries[index].data]] : []),
  );
}

export function usePoolMetrics(pools: RegistryPool[]) {
  const query = useQuery({
    queryKey: ["pool-metrics", pools.map((pool) => pool.pair).join(",")],
    enabled: pools.length > 0,
    staleTime: 30_000,
    retry: 1,
    queryFn: () => loadPoolMetrics(pools),
  });

  return {
    ...query,
    data: query.data?.data ?? ({} as PoolMetricsByPair),
    access: query.data?.state as DataAccessState | undefined,
  };
}

export function useStatsDashboard(pools: RegistryPool[]) {
  const query = useQuery({
    queryKey: ["stats-dashboard", pools.map((pool) => pool.pair).join(",")],
    enabled: true,
    staleTime: 30_000,
    retry: 1,
    queryFn: () => loadStatsDashboard(pools),
  });

  return {
    ...query,
    data: query.data?.data ?? ({ topPools: [] } as StatsDashboardData),
    access: query.data?.state as DataAccessState | undefined,
  };
}

export function usePoolCandles(pool: RegistryPool | undefined, options: { interval?: IndexerCandleInterval; range?: PoolCandleRange; limit?: number } = {}) {
  const interval = options.interval ?? "1h";
  const range = options.range ?? "7d";
  const limit = options.limit ?? 200;
  const query = useQuery({
    queryKey: ["pool-candles", pool?.pair, interval, range, limit],
    enabled: Boolean(pool),
    staleTime: 30_000,
    retry: 1,
    queryFn: () => loadPoolCandles(pool, { interval, range, limit }),
  });

  return {
    ...query,
    data: query.data?.data ?? [],
    access: query.data?.state as DataAccessState | undefined,
  };
}

export function useWalletIndexerData(address: string | undefined) {
  const query = useQuery({
    queryKey: ["wallet-indexer-data", address],
    enabled: Boolean(address),
    staleTime: 30_000,
    retry: 1,
    queryFn: () => loadWalletIndexerData(address),
  });

  return {
    ...query,
    data: query.data?.data ?? { positions: [], history: [] },
    access: query.data?.state as DataAccessState | undefined,
  };
}

export function usePoolActivity(pool: RegistryPool | undefined, limit = 10) {
  const query = useQuery({
    queryKey: ["pool-activity", pool?.pair, limit],
    enabled: Boolean(pool),
    staleTime: 15_000,
    retry: 1,
    queryFn: () => loadPoolActivity(pool, limit),
  });
  return { ...query, data: query.data?.data ?? [], access: query.data?.state as DataAccessState | undefined };
}
