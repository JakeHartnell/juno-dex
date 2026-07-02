import { useQuery } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { queryPairPool } from "../lib/astroport/queries";
import { loadPoolMetrics, loadWalletIndexerData, type DataAccessState } from "../lib/data-access/indexerFallback";
import type { PoolMetricsByPair } from "../lib/pools/poolList";

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

export function usePoolMetrics(pools: RegistryPool[]) {
  const query = useQuery({
    queryKey: ["pool-metrics", pools.map((pool) => pool.pair).join(",")],
    enabled: pools.length > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: () => loadPoolMetrics(pools),
  });

  return {
    ...query,
    data: query.data?.data ?? ({} as PoolMetricsByPair),
    access: query.data?.state as DataAccessState | undefined,
  };
}

export function useWalletIndexerData(address: string | undefined) {
  const query = useQuery({
    queryKey: ["wallet-indexer-data", address],
    enabled: Boolean(address),
    staleTime: 30_000,
    retry: false,
    queryFn: () => loadWalletIndexerData(address),
  });

  return {
    ...query,
    data: query.data?.data ?? { positions: [], history: [] },
    access: query.data?.state as DataAccessState | undefined,
  };
}
