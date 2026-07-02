import type { RegistryPool } from "../../config/registry";
import { isE2EMode } from "../../e2e/mocks";
import { createIndexerClient, getConfiguredIndexerBaseUrl, IndexerRequestError } from "../indexer/client";
import type { IndexerCandleInterval, IndexerPoolCandle, IndexerPoolMetrics, IndexerPoolPosition, IndexerProtocolStats, IndexerWalletTransaction } from "../indexer/types";
import type { PoolMetrics, PoolMetricsByPair } from "../pools/poolList";
import { sortTopPools, type ProtocolStats, type StatsDashboardData, type TopPool } from "../stats/dashboard";

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

export type PoolCandleRange = "24h" | "7d" | "30d" | "90d";
export type PoolCandlesOptions = {
  interval?: IndexerCandleInterval;
  range?: PoolCandleRange;
  limit?: number;
  baseAsset?: string;
  quoteAsset?: string;
};

const RANGE_MS: Record<PoolCandleRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
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

function normalizeProtocolStats(row: Partial<IndexerProtocolStats> & Record<string, unknown>, staleAfterMs: number): ProtocolStats | undefined {
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : undefined;
  const hasAnyMetric = [row.poolCount ?? row.pool_count, row.tvlUsd ?? row.tvl_usd, row.volume24hUsd ?? row.volume_24h_usd ?? row.volume24h_usd, row.fees24hUsd ?? row.fees_24h_usd ?? row.fees24h_usd].some((value) => optionalNumber(value) !== undefined);
  if (!hasAnyMetric) return undefined;
  const isMock = Boolean(row.isMock || row.dataSource === "mock");
  return {
    poolCount: optionalNumber(row.poolCount ?? row.pool_count),
    tvlUsd: optionalNumber(row.tvlUsd ?? row.tvl_usd),
    volume24hUsd: optionalNumber(row.volume24hUsd ?? row.volume_24h_usd ?? row.volume24h_usd),
    volume7dUsd: optionalNumber(row.volume7dUsd ?? row.volume_7d_usd ?? row.volume7d_usd),
    fees24hUsd: optionalNumber(row.fees24hUsd ?? row.fees_24h_usd ?? row.fees24h_usd),
    incentivizedPools: optionalNumber(row.incentivizedPools ?? row.incentivized_pools),
    source: isMock ? "mock" : "indexer",
    isMock,
    isStale: updatedAt ? Date.now() - Date.parse(updatedAt) > staleAfterMs : false,
    updatedAt,
  };
}

function normalizeTopPool(row: Partial<IndexerPoolMetrics> & Record<string, unknown>, poolsByPair: Map<string, RegistryPool>, staleAfterMs: number): TopPool | undefined {
  const pair = (row.pair ?? row.pairAddress ?? row.pair_address ?? row.address) as string | undefined;
  if (!pair) return undefined;
  const registryPool = poolsByPair.get(pair);
  const updatedAt = typeof row.updatedAt === "string" ? row.updatedAt : undefined;
  const isMock = Boolean(row.isMock || row.dataSource === "mock");
  const symbols = Array.isArray(row.assets) ? row.assets.map((asset) => (asset as { symbol?: string } | undefined)?.symbol).filter(Boolean).join(" / ") : undefined;
  return {
    pool: registryPool,
    id: String(row.id ?? registryPool?.id ?? pair),
    label: registryPool?.label ?? symbols ?? String(row.id ?? pair),
    pair,
    tvlUsd: optionalNumber(row.tvlUsd ?? row.tvl_usd),
    volume24hUsd: optionalNumber(row.volume24hUsd ?? row.volume_24h_usd ?? row.volume24h_usd),
    fees24hUsd: optionalNumber(row.fees24hUsd ?? row.fees_24h_usd ?? row.fees24h_usd),
    feeApr: optionalNumber(row.feeApr ?? row.fee_apr),
    incentivesApr: optionalNumber(row.incentivesApr ?? row.incentives_apr),
    totalApr: optionalNumber(row.totalApr ?? row.total_apr),
    source: isMock ? "mock" : "indexer",
    isMock,
    isStale: updatedAt ? Date.now() - Date.parse(updatedAt) > staleAfterMs : false,
    updatedAt,
  };
}

function normalizeCandle(row: Partial<IndexerPoolCandle> & Record<string, unknown>): IndexerPoolCandle | undefined {
  const bucketStart = (row.bucketStart ?? row.bucket_start) as string | undefined;
  const open = optionalNumber(row.open);
  const high = optionalNumber(row.high);
  const low = optionalNumber(row.low);
  const close = optionalNumber(row.close);
  if (!bucketStart || open === undefined || high === undefined || low === undefined || close === undefined) return undefined;
  return {
    poolId: (row.poolId ?? row.pool_id ?? row.pairAddress ?? row.pair_address ?? null) as string | null,
    pairAddress: (row.pairAddress ?? row.pair_address ?? row.poolId ?? row.pool_id ?? null) as string | null,
    baseAsset: (row.baseAsset ?? row.base_asset ?? null) as string | null,
    quoteAsset: (row.quoteAsset ?? row.quote_asset ?? null) as string | null,
    interval: (row.interval ?? "1h") as IndexerPoolCandle["interval"],
    bucketStart,
    open,
    high,
    low,
    close,
    volume: optionalNumber(row.volume) ?? 0,
    volumeQuote: optionalNumber(row.volumeQuote ?? row.volume_quote ?? row.volume_usd) ?? 0,
    tradeCount: optionalNumber(row.tradeCount ?? row.trade_count) ?? 0,
    dataSource: (row.dataSource ?? row.data_source ?? "indexer") as IndexerPoolCandle["dataSource"],
    isMock: Boolean(row.isMock ?? row.is_mock),
  };
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
  if (isE2EMode()) {
    return {
      data: Object.fromEntries(pools.map((pool) => [pool.pair, { tvlUsd: 125000, volume24hUsd: 42000, feeApr: 8.5, incentivesApr: 12.25, totalApr: 20.75, incentivized: true, source: "mock", isMock: true, isStale: false, updatedAt: new Date(0).toISOString() }])),
      state: { source: "mock", isFallback: false, isMock: true, isStale: false, updatedAt: new Date(0).toISOString() },
    };
  }
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

export async function loadStatsDashboard(pools: RegistryPool[], config = getIndexerRuntimeConfig()): Promise<DataAccessResult<StatsDashboardData>> {
  const empty = { topPools: [] };
  const earlyFallback = shouldUseFallback(config);
  if (earlyFallback) return { data: empty, state: earlyFallback };
  try {
    const client = createIndexerClient({ baseUrl: config.baseUrl!, timeoutMs: config.timeoutMs });
    const health = await withAttempts(config.retry, () => client.health());
    if (health.status !== "ok") throw new IndexerRequestError(`Indexer health is ${health.status}`, { code: "invalid-response" });
    const [statsPayload, poolsPayload] = await Promise.all([
      withAttempts(config.retry, () => client.stats()),
      withAttempts(config.retry, () => client.pools({ limit: Math.max(pools.length, 10) })),
    ]);
    const stats = normalizeProtocolStats(statsPayload as Partial<IndexerProtocolStats> & Record<string, unknown>, config.staleAfterMs);
    const poolsByPair = new Map(pools.map((pool) => [pool.pair, pool]));
    const topPools = sortTopPools(poolsPayload.data.map((row) => normalizeTopPool(row, poolsByPair, config.staleAfterMs)).filter((row): row is TopPool => Boolean(row))).slice(0, 5);
    if (!stats && topPools.length === 0) return { data: empty, state: fallbackState({ code: "empty", message: "Indexer returned no protocol stats or pool metrics" }) };
    const first = stats ?? topPools[0];
    return {
      data: { stats, topPools },
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
    return { data: empty, state: fallbackState(accessError) };
  }
}

export async function loadPoolCandles(pool: RegistryPool | undefined, options: PoolCandlesOptions = {}, config = getIndexerRuntimeConfig()): Promise<DataAccessResult<IndexerPoolCandle[]>> {
  if (!pool) return { data: [], state: fallbackState({ code: "disabled", message: "Pool is not selected" }, "disabled") };
  const earlyFallback = shouldUseFallback(config);
  if (earlyFallback) return { data: [], state: earlyFallback };
  try {
    const client = createIndexerClient({ baseUrl: config.baseUrl!, timeoutMs: config.timeoutMs });
    const interval = options.interval ?? "1h";
    const range = options.range ?? "7d";
    const to = new Date().toISOString();
    const from = new Date(Date.now() - RANGE_MS[range]).toISOString();
    const health = await withAttempts(config.retry, () => client.health());
    if (health.status !== "ok") throw new IndexerRequestError(`Indexer health is ${health.status}`, { code: "invalid-response" });
    const payload = await withAttempts(config.retry, () => client.poolCandles(pool.pair, {
      interval,
      from,
      to,
      baseAsset: options.baseAsset ?? pool.assets[0]?.id,
      quoteAsset: options.quoteAsset ?? pool.assets[1]?.id,
      limit: options.limit ?? 200,
    }));
    const candles = payload.data.map((row) => normalizeCandle(row)).filter((row): row is IndexerPoolCandle => Boolean(row));
    const first = candles.find((candle) => candle.isMock) ?? candles[0];
    const updatedAt = candles.at(-1)?.bucketStart;
    const isMock = Boolean(payload.meta?.isMock || first?.isMock || payload.meta?.dataSource === "mock");
    const isStale = updatedAt ? Date.now() - Date.parse(updatedAt) > config.staleAfterMs : false;
    return { data: candles, state: { source: isMock ? "mock" : "indexer", isFallback: false, isMock, isStale, updatedAt } };
  } catch (error) {
    const accessError = toAccessError(error, "network");
    openCircuit(config, accessError);
    return { data: [], state: fallbackState(accessError) };
  }
}

export async function loadWalletIndexerData(address: string | undefined, config = getIndexerRuntimeConfig()): Promise<DataAccessResult<{ positions: IndexerPoolPosition[]; history: IndexerWalletTransaction[] }>> {
  const empty = { positions: [], history: [] };
  if (!address) return { data: empty, state: fallbackState({ code: "disabled", message: "Wallet is not connected" }, "disabled") };
  if (isE2EMode()) {
    return {
      data: {
        positions: [],
        history: [{
          txHash: "E2E_MOCK_TX_SWAP_000",
          walletAddress: address,
          poolId: "juno-agent-preview-xyk-1",
          pairAddress: "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv",
          type: "swap",
          height: 123456,
          timestamp: new Date(0).toISOString(),
          offerAsset: { denom: "ujuno", symbol: "JUNO", amount: "1000000" },
          askAsset: { denom: "factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/junoagenttest202607010323", symbol: "JUNOAGENT-TEST", amount: "1970000" },
          amountUsd: 1.23,
          feeUsd: 0.01,
          success: true,
          dataSource: "mock",
          isMock: true,
        }],
      },
      state: { source: "mock", isFallback: false, isMock: true, isStale: false, updatedAt: new Date(0).toISOString() },
    };
  }
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