import type { RegistryPool } from "../../config/registry";

export type PoolMetricValue = number | null | undefined;

export type PoolMetrics = {
  tvlUsd?: PoolMetricValue;
  volume24hUsd?: PoolMetricValue;
  feeApr?: PoolMetricValue;
  incentivesApr?: PoolMetricValue;
  totalApr?: PoolMetricValue;
  incentivized?: boolean;
  source?: "indexer" | "mock" | "fallback" | "disabled";
  isMock?: boolean;
  isStale?: boolean;
  updatedAt?: string;
};

export type PoolListSortKey = "featured" | "pool" | "tvl" | "volume" | "apr";
export type PoolListSortDirection = "asc" | "desc";
export type PoolTypeFilter = "all" | RegistryPool["type"];
export type PoolVerifiedFilter = "all" | "verified" | "unverified";
export type PoolIncentiveFilter = "all" | "incentivized" | "unincentivized";

export type PoolListControls = {
  search: string;
  type: PoolTypeFilter;
  verified: PoolVerifiedFilter;
  incentivized: PoolIncentiveFilter;
  sortKey: PoolListSortKey;
  sortDirection: PoolListSortDirection;
};

export type PoolMetricsByPair = Record<string, PoolMetrics | undefined>;

export const DEFAULT_POOL_LIST_CONTROLS: PoolListControls = {
  search: "",
  type: "all",
  verified: "all",
  incentivized: "all",
  sortKey: "featured",
  sortDirection: "desc",
};

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

export function poolMatchesSearch(pool: RegistryPool, search: string) {
  const query = normalizeSearch(search);
  if (!query) return true;

  const haystack = [
    pool.label,
    pool.id,
    pool.pair,
    pool.lpToken,
    pool.type,
    ...pool.assets.flatMap((asset) => [asset.symbol, asset.id, asset.denomTrace ?? ""]),
  ].join(" ").toLowerCase();

  return haystack.includes(query);
}

function metricNumber(pool: RegistryPool, metricsByPair: PoolMetricsByPair, sortKey: PoolListSortKey) {
  const metrics = metricsByPair[pool.pair];
  if (sortKey === "tvl") return metrics?.tvlUsd;
  if (sortKey === "volume") return metrics?.volume24hUsd;
  if (sortKey === "apr") return metrics?.totalApr ?? metrics?.feeApr;
  return undefined;
}

function compareMetricValues(a: PoolMetricValue, b: PoolMetricValue, direction: PoolListSortDirection) {
  const aNumber = typeof a === "number" && Number.isFinite(a) ? a : undefined;
  const bNumber = typeof b === "number" && Number.isFinite(b) ? b : undefined;
  if (aNumber === undefined && bNumber === undefined) return 0;
  if (aNumber === undefined) return 1;
  if (bNumber === undefined) return -1;
  return direction === "asc" ? aNumber - bNumber : bNumber - aNumber;
}

export function getPoolTotalApr(metrics: PoolMetrics | undefined) {
  if (!metrics) return undefined;
  if (typeof metrics.totalApr === "number") return metrics.totalApr;
  const parts = [metrics.feeApr, metrics.incentivesApr].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (parts.length === 0) return undefined;
  return parts.reduce((sum, value) => sum + value, 0);
}

export function filterAndSortPools(
  pools: RegistryPool[],
  controls: PoolListControls,
  metricsByPair: PoolMetricsByPair = {},
) {
  const filtered = pools.filter((pool) => {
    if (!poolMatchesSearch(pool, controls.search)) return false;
    if (controls.type !== "all" && pool.type !== controls.type) return false;
    if (controls.verified === "verified" && pool.verified === false) return false;
    if (controls.verified === "unverified" && pool.verified !== false) return false;

    const isIncentivized = Boolean(metricsByPair[pool.pair]?.incentivized || (metricsByPair[pool.pair]?.incentivesApr ?? 0) > 0);
    if (controls.incentivized === "incentivized" && !isIncentivized) return false;
    if (controls.incentivized === "unincentivized" && isIncentivized) return false;

    return true;
  });

  return [...filtered].sort((a, b) => {
    if (controls.sortKey === "featured") {
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.label.localeCompare(b.label);
    }
    if (controls.sortKey === "pool") {
      return controls.sortDirection === "asc" ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
    }

    const metricComparison = compareMetricValues(
      metricNumber(a, metricsByPair, controls.sortKey),
      metricNumber(b, metricsByPair, controls.sortKey),
      controls.sortDirection,
    );
    return metricComparison || a.label.localeCompare(b.label);
  });
}
