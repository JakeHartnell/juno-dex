import { describe, expect, it } from "vitest";
import { DEFAULT_START_HEIGHT, loadConfig } from "../src/config.js";

const performanceEnvNames = [
  "INDEXER_MODE",
  "RANGE_SIZE",
  "FETCH_WINDOW_SIZE",
  "FETCH_CONCURRENCY",
  "REALTIME_FETCH_CONCURRENCY",
  "RPC_TIMEOUT_MS",
  "RPC_MAX_RETRIES",
  "INGEST_CANDLES_INLINE",
  "INGEST_RESERVE_SNAPSHOTS_INLINE",
  "INGEST_AGGREGATES_INLINE",
  "INGEST_BULK_STAGING_ENABLED",
  "READ_MODEL_REFRESH_INTERVAL_MS",
] as const;

function withEnv(overrides: Record<string, string | undefined>, run: () => void): void {
  const previous = { ...process.env };
  try {
    for (const name of ["DATABASE_URL", "START_HEIGHT", ...performanceEnvNames]) delete process.env[name];
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    run();
  } finally {
    process.env = previous;
  }
}

describe("config", () => {
  it("loads sane defaults", () => {
    withEnv({}, () => {
      const config = loadConfig();
      expect(config.chainId).toBe("juno-1");
      expect(config.databaseUrl).toBe("postgres://postgres:postgres@localhost:5432/astroport_indexer");
      expect(config.startHeight).toBe(DEFAULT_START_HEIGHT);
      expect(config.batchSize).toBeGreaterThan(0);
      expect(config.wsUrl).toContain("websocket");
      expect(config.indexerMode).toBe("realtime");
      expect(config.rangeSize).toBe(5_000);
      expect(config.fetchWindowSize).toBe(250);
      expect(config.fetchConcurrency).toBe(32);
      expect(config.realtimeFetchConcurrency).toBe(8);
      expect(config.rpcTimeoutMs).toBe(10_000);
      expect(config.rpcMaxRetries).toBe(5);
      expect(config.ingestCandlesInline).toBe(true);
      expect(config.ingestReserveSnapshotsInline).toBe(true);
      expect(config.ingestAggregatesInline).toBe(false);
      expect(config.ingestBulkStagingEnabled).toBe(false);
      expect(config.readModelRefreshIntervalMs).toBe(15_000);
      expect(config.priceProviderName).toBe("provider");
      expect(config.priceCacheTtlMs).toBe(300_000);
      expect(config.priceAllowStale).toBe(true);
      expect(config.apiPort).toBe(8787);
    });
  });

  it("loads performance runtime overrides", () => {
    withEnv({
      INDEXER_MODE: "catchup",
      RANGE_SIZE: "10000",
      FETCH_WINDOW_SIZE: "500",
      FETCH_CONCURRENCY: "64",
      REALTIME_FETCH_CONCURRENCY: "4",
      RPC_TIMEOUT_MS: "20000",
      RPC_MAX_RETRIES: "7",
      INGEST_CANDLES_INLINE: "false",
      INGEST_RESERVE_SNAPSHOTS_INLINE: "0",
      INGEST_AGGREGATES_INLINE: "true",
      INGEST_BULK_STAGING_ENABLED: "yes",
      READ_MODEL_REFRESH_INTERVAL_MS: "0",
    }, () => {
      expect(loadConfig()).toMatchObject({
        indexerMode: "catchup",
        rangeSize: 10_000,
        fetchWindowSize: 500,
        fetchConcurrency: 64,
        realtimeFetchConcurrency: 4,
        rpcTimeoutMs: 20_000,
        rpcMaxRetries: 7,
        ingestCandlesInline: false,
        ingestReserveSnapshotsInline: false,
        ingestAggregatesInline: true,
        ingestBulkStagingEnabled: true,
        readModelRefreshIntervalMs: 0,
      });
    });
  });

  it("validates integer values", () => {
    withEnv({ START_HEIGHT: "not-a-number" }, () => {
      expect(() => loadConfig()).toThrow(/START_HEIGHT/);
    });
  });

  it("validates indexer mode", () => {
    withEnv({ INDEXER_MODE: "fast" }, () => {
      expect(() => loadConfig()).toThrow(/INDEXER_MODE must be either "realtime" or "catchup"/);
    });
  });

  it("requires concurrency and window sizes to be at least one", () => {
    withEnv({ FETCH_WINDOW_SIZE: "0" }, () => {
      expect(() => loadConfig()).toThrow(/FETCH_WINDOW_SIZE must be an integer greater than or equal to 1/);
    });
    withEnv({ FETCH_CONCURRENCY: "0" }, () => {
      expect(() => loadConfig()).toThrow(/FETCH_CONCURRENCY must be an integer greater than or equal to 1/);
    });
    withEnv({ REALTIME_FETCH_CONCURRENCY: "0" }, () => {
      expect(() => loadConfig()).toThrow(/REALTIME_FETCH_CONCURRENCY must be an integer greater than or equal to 1/);
    });
  });

  it("requires fetch concurrency to fit within the fetch window", () => {
    withEnv({ FETCH_WINDOW_SIZE: "10", FETCH_CONCURRENCY: "11" }, () => {
      expect(() => loadConfig()).toThrow(/FETCH_CONCURRENCY must be less than or equal to FETCH_WINDOW_SIZE/);
    });
  });

  it("allows non-negative retry and timeout values", () => {
    withEnv({ RPC_TIMEOUT_MS: "0", RPC_MAX_RETRIES: "0" }, () => {
      expect(loadConfig()).toMatchObject({ rpcTimeoutMs: 0, rpcMaxRetries: 0 });
    });
  });
});
