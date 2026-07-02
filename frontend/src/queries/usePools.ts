import { useQuery } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { queryPairPool } from "../lib/astroport/queries";
import type { PoolMetrics, PoolMetricsByPair } from "../lib/pools/poolList";

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

type IndexerPoolMetrics = Partial<PoolMetrics> & {
  pair?: string;
  pairAddress?: string;
  pair_address?: string;
  address?: string;
  tvl_usd?: number | string | null;
  volume_24h_usd?: number | string | null;
  volume24h_usd?: number | string | null;
  fee_apr?: number | string | null;
  incentives_apr?: number | string | null;
  total_apr?: number | string | null;
};

type IndexerMetricsPayload = IndexerPoolMetrics[] | { pools?: IndexerPoolMetrics[]; data?: IndexerPoolMetrics[] };

function optionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeMetrics(row: IndexerPoolMetrics): [string, PoolMetrics] | undefined {
  const pair = row.pair ?? row.pairAddress ?? row.pair_address ?? row.address;
  if (!pair) return undefined;
  const metrics: PoolMetrics = {
    tvlUsd: optionalNumber(row.tvlUsd ?? row.tvl_usd),
    volume24hUsd: optionalNumber(row.volume24hUsd ?? row.volume_24h_usd ?? row.volume24h_usd),
    feeApr: optionalNumber(row.feeApr ?? row.fee_apr),
    incentivesApr: optionalNumber(row.incentivesApr ?? row.incentives_apr),
    totalApr: optionalNumber(row.totalApr ?? row.total_apr),
    incentivized: Boolean(row.incentivized),
    source: "indexer",
  };
  return [pair, metrics];
}

function metricsEndpoint() {
  const baseUrl = (import.meta.env.VITE_DEX_INDEXER_URL as string | undefined)?.replace(/\/$/, "");
  if (!baseUrl) return undefined;
  return `${baseUrl}/pools`;
}

export function usePoolMetrics(pools: RegistryPool[]) {
  const endpoint = metricsEndpoint();
  return useQuery({
    queryKey: ["pool-metrics", endpoint, pools.map((pool) => pool.pair).join(",")],
    enabled: Boolean(endpoint) && pools.length > 0,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<PoolMetricsByPair> => {
      if (!endpoint) return {};
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Indexer metrics unavailable: ${response.status}`);
      const payload = await response.json() as IndexerMetricsPayload;
      const rows = Array.isArray(payload) ? payload : payload.pools ?? payload.data ?? [];
      return Object.fromEntries(rows.map(normalizeMetrics).filter((entry): entry is [string, PoolMetrics] => Boolean(entry)));
    },
  });
}
