export const DEFAULT_CONTRACTS = {
  factory: "juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca",
  router: "juno1fppwfa2efpsahvwlqprrshjth2mfqyd8n80yd7z5kpjspq30s8ksrapa8s",
  incentives: "juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598",
  oracle: "juno1szsxu32r7rnu5wq7yqlxq4x46g0fq7qpzyggcvgsh2cq554mcuqql6jw4p",
  nativeCoinRegistry:
    "juno1qwer7jleluth33trk2ywqvp6vwjh4j4zar3ag6dw5d8derkpel0sq8vfh2",
} as const;

export const DEFAULT_START_HEIGHT = 39_381_297;

export type IndexerMode = "realtime" | "catchup";

export type IndexerConfig = {
  databaseUrl: string;
  rpcUrl: string;
  restUrl: string;
  wsUrl: string;
  chainId: string;
  factoryAddress: string;
  routerAddress: string;
  incentivesAddress: string;
  oracleAddress: string;
  nativeCoinRegistryAddress: string;
  startHeight: number;
  confirmationDepth: number;
  pollIntervalMs: number;
  batchSize: number;
  dryRun: boolean;
  cursorId: string;
  indexerMode: IndexerMode;
  rangeSize: number;
  fetchWindowSize: number;
  fetchConcurrency: number;
  realtimeFetchConcurrency: number;
  rpcTimeoutMs: number;
  rpcMaxRetries: number;
  ingestCandlesInline: boolean;
  ingestReserveSnapshotsInline: boolean;
  ingestAggregatesInline: boolean;
  ingestBulkStagingEnabled: boolean;
  priceProviderBaseUrl?: string;
  priceProviderApiKey?: string;
  priceProviderName: string;
  priceCacheTtlMs: number;
  priceStaleAfterMs: number;
  priceAllowStale: boolean;
  priceDevMocks: boolean;
  readModelRefreshIntervalMs: number;
  apiPort: number;
};

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

type IntEnvOptions = { min?: number; label?: string };

process.loadEnvFile?.(".env");

function intEnv(
  name: string,
  fallback: number,
  options: IntEnvOptions = {},
): number {
  const value = process.env[name];
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed))
    throw new Error(
      `${name} must be ${options.label ?? "a non-negative integer"}`,
    );
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < (options.min ?? 0)) {
    throw new Error(
      `${name} must be ${options.label ?? "a non-negative integer"}`,
    );
  }
  return parsed;
}

function boolEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function indexerModeEnv(): IndexerMode {
  const value = env("INDEXER_MODE", "realtime");
  if (value === "realtime" || value === "catchup") return value;
  throw new Error('INDEXER_MODE must be either "realtime" or "catchup"');
}

function deriveWsUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/websocket";
  return url.toString();
}

export function loadConfig(): IndexerConfig {
  const rpcUrl = env(
    "JUNO_RPC_URL",
    "https://juno-rpc.publicnode.com:443",
  ).replace(/\/$/, "");
  const fetchWindowSize = intEnv("FETCH_WINDOW_SIZE", 250, {
    min: 1,
    label: "an integer greater than or equal to 1",
  });
  const fetchConcurrency = intEnv("FETCH_CONCURRENCY", 32, {
    min: 1,
    label: "an integer greater than or equal to 1",
  });
  if (fetchConcurrency > fetchWindowSize) {
    throw new Error(
      "FETCH_CONCURRENCY must be less than or equal to FETCH_WINDOW_SIZE",
    );
  }

  return {
    databaseUrl: env(
      "DATABASE_URL",
      "postgres://postgres:postgres@localhost:5432/astroport_indexer",
    ),
    rpcUrl,
    restUrl: env("JUNO_REST_URL", "https://juno-rest.publicnode.com").replace(
      /\/$/,
      "",
    ),
    wsUrl: env("JUNO_WS_URL", deriveWsUrl(rpcUrl)),
    chainId: env("CHAIN_ID", "juno-1"),
    factoryAddress: env("FACTORY_ADDRESS", DEFAULT_CONTRACTS.factory),
    routerAddress: env("ROUTER_ADDRESS", DEFAULT_CONTRACTS.router),
    incentivesAddress: env("INCENTIVES_ADDRESS", DEFAULT_CONTRACTS.incentives),
    oracleAddress: env("ORACLE_ADDRESS", DEFAULT_CONTRACTS.oracle),
    nativeCoinRegistryAddress: env(
      "NATIVE_COIN_REGISTRY_ADDRESS",
      DEFAULT_CONTRACTS.nativeCoinRegistry,
    ),
    startHeight: intEnv("START_HEIGHT", DEFAULT_START_HEIGHT),
    confirmationDepth: intEnv("CONFIRMATION_DEPTH", 2),
    pollIntervalMs: intEnv("POLL_INTERVAL_MS", 5_000),
    batchSize: intEnv("BATCH_SIZE", 20, {
      min: 1,
      label: "an integer greater than or equal to 1",
    }),
    dryRun: boolEnv("DRY_RUN"),
    cursorId: env("CURSOR_ID", "astroport-juno-v1"),
    indexerMode: indexerModeEnv(),
    rangeSize: intEnv("RANGE_SIZE", 5_000, {
      min: 1,
      label: "an integer greater than or equal to 1",
    }),
    fetchWindowSize,
    fetchConcurrency,
    realtimeFetchConcurrency: intEnv("REALTIME_FETCH_CONCURRENCY", 8, {
      min: 1,
      label: "an integer greater than or equal to 1",
    }),
    rpcTimeoutMs: intEnv("RPC_TIMEOUT_MS", 10_000),
    rpcMaxRetries: intEnv("RPC_MAX_RETRIES", 5),
    ingestCandlesInline: boolEnv("INGEST_CANDLES_INLINE", true),
    ingestReserveSnapshotsInline: boolEnv(
      "INGEST_RESERVE_SNAPSHOTS_INLINE",
      true,
    ),
    ingestAggregatesInline: boolEnv("INGEST_AGGREGATES_INLINE", false),
    ingestBulkStagingEnabled: boolEnv("INGEST_BULK_STAGING_ENABLED", false),
    priceProviderBaseUrl: process.env.PRICE_PROVIDER_BASE_URL || undefined,
    priceProviderApiKey: process.env.PRICE_PROVIDER_API_KEY || undefined,
    priceProviderName: env("PRICE_PROVIDER_NAME", "provider"),
    priceCacheTtlMs: intEnv("PRICE_CACHE_TTL_MS", 300_000),
    priceStaleAfterMs: intEnv("PRICE_STALE_AFTER_MS", 1_800_000),
    priceAllowStale: boolEnv("PRICE_ALLOW_STALE", true),
    priceDevMocks: boolEnv("PRICE_DEV_MOCKS"),
    readModelRefreshIntervalMs: intEnv("READ_MODEL_REFRESH_INTERVAL_MS", 15_000),
    apiPort: intEnv("API_PORT", 8787),
  };
}
