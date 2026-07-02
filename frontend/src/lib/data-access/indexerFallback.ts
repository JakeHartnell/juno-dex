import type { RegistryPool } from "../../config/registry";
import { createIndexerClient, getConfiguredIndexerBaseUrl, IndexerRequestError } from "../indexer/client";
import type { IndexerPoolMetrics, IndexerPoolPosition, IndexerWalletTransaction } from "../indexer/types";
import type { PoolMetrics, PoolMetricsByPair } from "../pools/poolList";

export type DataSourceKind = "indexer" | "mock" | "fallback" | "disabled";
export type DataAccessErrorCode = "disabled" | "health" | "timeout" | "http" | "network" | "empty" | "invalid-response";

export type DataAccessState = {
  source: DataSourceKind;
  isFallback: boolean;
  isMock: boolean;
  isStale: boolean;
  updatedAt?: string;
  error?: {
    code: DataAccessErrorCode;
    message: string;
    status?: number;
  };
};

export type DataAccessResult<T> = {
  data: T;
  state: DataAccessState;
};

export type IndexerRuntimeConfig = {
  baseUrl?: string;
  disabled: boolean;
  timeoutMs: number;
  retry: number;
  staleAfterMs: number;
  circuitBreakerMs: number;
};

let circuitOpenUntil = 0;
let lastFailure: DataAccessState["error"] | undefined;

function envNumber(name: string, fallback: number) {
  const raw = import.meta.env[name] as string | undefined;
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getIndexerRuntimeConfig(): IndexerRuntimeConfig {
  const disabled = (import.meta.env.VITE_DEX_INDEXER_DISABLED as string | undefined)?.toLowerCase() === "true";
  return {
    baseUrl: getConfiguredIndexerBaseUrl(),
    disabled,
    timeoutMs: envNumber("VITE_DEX_INDEXER_TIMEOUT_MS", 2_500),
    retry: envNumber("VITE_DEX_INDEXER_RETRY", 1),
    staleAfterMs: envNumber("VITE_DEX_INDEXER_STALE_AFTER_MS", 120_000),
    circuitBreakerMs: envNumber("VITE_DEX_INDEXER_CIRCUIT_BREAKER_MS", 60_000),
  };
}

export function resetIndexerCircuitBreakerForTests() {
  circuitOpenUntil = 0;
  lastFailure = undefined;
}

function optionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toAccessError(error: unknown, fallbackCode: DataAccessErrorCode): DataAccessState["error"] {
  if (error instanceof IndexerRequestError) {
    return { code: error.code === "disabled" ? "disabled" : error.code, message: error.message, status: error.status };
  }
  return { code: fallbackCode, message: error instanceof Error ? error.message : String(error) };
}

function fallbackState(error: DataAccessState["error"], source: DataSourceKind = "fallback"): DataAccessState {
  return { source, isFallback: source !== "indexer" && source !== "mock", isMock: false, isStale: false, error };
}

export function dataSourceLabel(state: DataAccessState | undefined) {
  if (!state) return "On-chain fallback";
  if (state.source === "mock") return state.isStale ? "Mock indexer data (stale)" : "Mock indexer data";
  if (state.source === "indexer") return state.isStale ? "Indexer data (stale)" : "Indexer data";
  if (state.source === "disabled") return "Indexer disabled; on-chain fallback";
  return "On-chain fallback";
}

function normalizePoolMetric(row: Partial<IndexerPoolMetrics> & Record<string, unknown>, staleAfterMs: number): [string, PoolMetrics] | undefined {
  const pair = (row.pair ?? row.pairAddress ?? row.pair_address ?? row.address) as string | undefined;
  if (!pair) return undefined;
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : undefined;
  const isMock = Boolean(row.isMock || row.dataSource === "mock");
  const isStale = updatedAt ? Date.now() - Date.parse(updatedAt) > staleAfterMs : false;
  return [pair, {
    tvlUsd: optionalNumber(row.tvlUsd ?? row.tvl_usd),
    volume24hUsd: optionalNumber(row.volume24hUsd ?? row.volume_24h_usd ?? row.volume24h_usd),
    feeApr: optionalNumber(row.feeApr ?? row.fee_apr),
    incentivesApr: optionalNumber(row.incentivesApr ?? row.incentives_apr),
    totalApr: optionalNumber(row.totalApr ?? row.total_apr),
    incentivized: Boolean(row.incentivized),
    source: isMock ? "mock" : "indexer",
    isMock,
    isStale,
    updatedAt,
  }];
}

async function withAttempts<T>(attempts: number, fn: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function shouldUseFallback(config: IndexerRuntimeConfig): DataAccessState | undefined {
  if (config.disabled || !config.baseUrl) {
    return fallbackState({ code: "disabled", message: config.disabled ? "Indexer disabled by configuration" : "Indexer URL is not configured" }, "disabled");
  }
  if (Date.now() < circuitOpenUntil) {
    return fallbackState(lastFailure ?? { code: "network", message: "Indexer circuit breaker is open" });
  }
  return undefined;
}

function openCircuit(config: IndexerRuntimeConfig, error: DataAccessState["error"]) {
  lastFailure = error;
  circuitOpenUntil = Date.now() + config.circuitBreakerMs;
}

export async function loadPoolMetrics(pools: RegistryPool[], config = getIndexerRuntimeConfig()): Promise<DataAccessResult<PoolMetricsByPair>> {
  const earlyFallback = shouldUseFallback(config);
  if (earlyFallback) return { data: {}, state: earlyFallback };
  try {
    const client = createIndexerClient({ baseUrl: config.baseUrl!, timeoutMs: config.timeoutMs });
    const health = await withAttempts(config.retry, () => client.health());
    if (health.status !== "ok") throw new IndexerRequestError(`Indexer health is ${health.status}`, { code: "invalid-response" });
    const payload = await withAttempts(config.retry, () => client.pools({ limit: Math.max(pools.length, 50) }));
    const entries = payload.data.map((row) => normalizePoolMetric(row, config.staleAfterMs)).filter((entry): entry is [string, PoolMetrics] => Boolean(entry));
    if (entries.length === 0) {
      return { data: {}, state: fallbackState({ code: "empty", message: "Indexer returned no pool metrics; using on-chain reserve fallback" }) };
    }
    const first = entries.find(([, metric]) => metric.isMock || metric.isStale)?.[1];
    return {
      data: Object.fromEntries(entries),
      state: {
        source: first?.isMock ? "mock" : "indexer",
        isFallback: false,
        isMock: Boolean(first?.isMock),
        isStale: Boolean(first?.isStale),
        updatedAt: first?.updatedAt,
      },
    };
  } catch (error) {
    const accessError = toAccessError(error, "network");
    openCircuit(config, accessError);
    return { data: {}, state: fallbackState(accessError) };
  }
}

export async function loadWalletIndexerData(address: string | undefined, config = getIndexerRuntimeConfig()): Promise<DataAccessResult<{ positions: IndexerPoolPosition[]; history: IndexerWalletTransaction[] }>> {
  const empty = { positions: [], history: [] };
  if (!address) return { data: empty, state: fallbackState({ code: "disabled", message: "Wallet is not connected" }, "disabled") };
  const earlyFallback = shouldUseFallback(config);
  if (earlyFallback) return { data: empty, state: earlyFallback };
  try {
    const client = createIndexerClient({ baseUrl: config.baseUrl!, timeoutMs: config.timeoutMs });
    await withAttempts(config.retry, () => client.health());
    const [positions, history] = await Promise.all([
      withAttempts(config.retry, () => client.walletPositions(address, { limit: 100 })),
      withAttempts(config.retry, () => client.walletHistory(address, { limit: 50 })),
    ]);
    const firstPosition = positions.data[0];
    const firstHistory = history.data[0];
    const first = firstPosition ?? firstHistory;
    const updatedAt = firstPosition?.updatedAt ?? firstHistory?.timestamp;
    const isMock = Boolean(first?.isMock || first?.dataSource === "mock");
    const isStale = updatedAt ? Date.now() - Date.parse(updatedAt) > config.staleAfterMs : false;
    return { data: { positions: positions.data, history: history.data }, state: { source: isMock ? "mock" : "indexer", isFallback: false, isMock, isStale, updatedAt } };
  } catch (error) {
    const accessError = toAccessError(error, "network");
    openCircuit(config, accessError);
    return { data: empty, state: fallbackState(accessError) };
  }
}
