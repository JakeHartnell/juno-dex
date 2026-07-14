import type { RegistryPool } from "../../config/registry";
import type { DataAccessState } from "../data-access/indexerFallback";
import type { PoolMetrics } from "../pools/poolList";

export type ProtocolStats = {
  poolCount?: number;
  tvlUsd?: number;
  tvlJuno?: number;
  volume24hUsd?: number;
  volume24hJuno?: number;
  volume7dUsd?: number;
  volume7dJuno?: number;
  fees24hUsd?: number;
  fees24hJuno?: number;
  incentivizedPools?: number;
  source?: PoolMetrics["source"];
  isMock?: boolean;
  isStale?: boolean;
  updatedAt?: string;
};

export type TopPool = {
  pool?: RegistryPool;
  id: string;
  label: string;
  pair: string;
  tvlUsd?: number | null;
  tvlJuno?: number | null;
  volume24hUsd?: number | null;
  volume24hJuno?: number | null;
  fees24hUsd?: number | null;
  fees24hJuno?: number | null;
  feeApr?: number;
  incentivesApr?: number;
  totalApr?: number;
  source?: PoolMetrics["source"];
  isMock?: boolean;
  isStale?: boolean;
  updatedAt?: string;
};

export type StatsDashboardData = {
  stats?: ProtocolStats;
  topPools: TopPool[];
};

export function formatUsdCompact(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 1 : 2,
  }).format(value);
}

export function formatJunoCompact(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return `${new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 1_000 ? 1 : 2,
  }).format(value)} JUNO`;
}

export function formatMarketValue(usdValue: number | null | undefined, junoValue: number | null | undefined) {
  return typeof usdValue === "number" && Number.isFinite(usdValue)
    ? formatUsdCompact(usdValue)
    : formatJunoCompact(junoValue);
}

export function formatInteger(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unavailable";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

export function topPoolMetric(pool: TopPool) {
  return pool.tvlUsd ?? pool.tvlJuno ?? pool.volume24hUsd ?? pool.volume24hJuno ?? pool.totalApr ?? pool.feeApr;
}

export function sortTopPools(pools: readonly TopPool[]) {
  return [...pools].sort((a, b) => {
    const aMetric = topPoolMetric(a);
    const bMetric = topPoolMetric(b);
    const aNumber = typeof aMetric === "number" && Number.isFinite(aMetric) ? aMetric : undefined;
    const bNumber = typeof bMetric === "number" && Number.isFinite(bMetric) ? bMetric : undefined;
    if (aNumber === undefined && bNumber === undefined) return a.label.localeCompare(b.label);
    if (aNumber === undefined) return 1;
    if (bNumber === undefined) return -1;
    return bNumber - aNumber || a.label.localeCompare(b.label);
  });
}

export function dashboardUnavailableCopy(access: DataAccessState | undefined) {
  if (!access) return "Loading protocol analytics…";
  if (access.source === "indexer" || access.source === "mock") return undefined;
  if (access.error?.code === "disabled") return "Protocol analytics are not configured. Swap, pools, and liquidity remain available.";
  if (access.error?.code === "empty") return "Protocol totals are not available yet. Unverified placeholder values are not shown.";
  return "Protocol analytics are temporarily unavailable. Swap, pools, and liquidity remain available.";
}
