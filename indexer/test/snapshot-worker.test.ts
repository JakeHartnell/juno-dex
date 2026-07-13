import { describe, expect, it } from "vitest";
import { DEFAULT_CONTRACTS, type IndexerConfig } from "../src/config.js";
import { isPermanentSnapshotFailure, SnapshotWorker } from "../src/snapshot-worker.js";

type Query = { text: string; values?: unknown[] };
type JobRow = { id: string; chain_id: string; pair_address: string; height: string; block_time: string; reason: string; status: string; attempts: number };

class FakeSnapshotClient {
  queries: Query[] = [];
  jobRows: JobRow[] = [{ id: "1", chain_id: "juno-1", pair_address: "juno1pair", height: "39381355", block_time: "2026-07-01T03:01:00Z", reason: "touched", status: "leased", attempts: 1 }];

  async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (text.includes("WITH claimable")) return { rows: this.jobRows as T[], rowCount: this.jobRows.length };
    if (text.includes("FROM pools") && text.includes("pair_address")) return { rows: [{ id: "pool-1" }] as T[], rowCount: 1 };
    if (text.includes("INSERT INTO pool_state_snapshots")) return { rows: [] as T[], rowCount: 1 };
    if (text.includes("UPDATE snapshot_jobs")) return { rows: [] as T[], rowCount: 1 };
    return { rows: [] as T[], rowCount: 0 };
  }

  release() {}
}

class FakeSnapshotPool {
  readonly client = new FakeSnapshotClient();
  async connect() { return this.client; }
}

const config: IndexerConfig = {
  databaseUrl: "postgres://test",
  rpcUrl: "https://rpc.example",
  restUrl: "https://lcd.example",
  wsUrl: "wss://rpc.example/websocket",
  chainId: "juno-1",
  factoryAddress: DEFAULT_CONTRACTS.factory,
  routerAddress: DEFAULT_CONTRACTS.router,
  incentivesAddress: DEFAULT_CONTRACTS.incentives,
  oracleAddress: DEFAULT_CONTRACTS.oracle,
  nativeCoinRegistryAddress: DEFAULT_CONTRACTS.nativeCoinRegistry,
  startHeight: 11,
  confirmationDepth: 2,
  pollIntervalMs: 1,
  batchSize: 1,
  dryRun: false,
  cursorId: "astroport-juno-v1",
  indexerMode: "realtime",
  rangeSize: 5_000,
  fetchWindowSize: 250,
  fetchConcurrency: 32,
  realtimeFetchConcurrency: 8,
  rpcTimeoutMs: 10_000,
  rpcMaxRetries: 5,
  ingestCandlesInline: true,
  ingestReserveSnapshotsInline: false,
  ingestAggregatesInline: false,
  ingestBulkStagingEnabled: false,
  priceProviderName: "provider",
  priceCacheTtlMs: 300_000,
  priceStaleAfterMs: 1_800_000,
  priceAllowStale: true,
  priceDevMocks: false,
  readModelRefreshIntervalMs: 0,
  apiPort: 8787,
};

describe("SnapshotWorker", () => {
  it("processes a claimed job by querying LCD at height, writing a snapshot, and marking success", async () => {
    const pool = new FakeSnapshotPool();
    const rest = {
      poolState: async (pairAddress: string, height?: number) => {
        expect(pairAddress).toBe("juno1pair");
        expect(height).toBe(39381355);
        return { reserves: [{ denom: "ujuno", amount: "123" }], totalShare: "456" };
      },
    };

    await expect(new SnapshotWorker(config, pool as never, rest, { batchSize: 10, leaseSeconds: 30, maxAttempts: 3 }).processBatch()).resolves.toBe(1);

    const claim = pool.client.queries.find((query) => query.text.includes("FOR UPDATE SKIP LOCKED"));
    expect(claim?.values).toEqual(["juno-1", 10, "30 seconds", 3]);
    const snapshot = pool.client.queries.find((query) => query.text.includes("INSERT INTO pool_state_snapshots"));
    expect(snapshot?.values).toEqual(["pool-1", 39381355, "2026-07-01T03:01:00Z", JSON.stringify([{ denom: "ujuno", amount: "123" }]), "456", "lcd"]);
    expect(pool.client.queries.some((query) => query.text.includes("status = 'succeeded'"))).toBe(true);
  });

  it("retries transient LCD failures by returning the job to pending", async () => {
    const pool = new FakeSnapshotPool();
    const rest = { poolState: async () => { throw new Error("LCD smart query failed: 500 unavailable"); } };

    await expect(new SnapshotWorker(config, pool as never, rest, { maxAttempts: 5 }).processBatch()).resolves.toBe(1);

    const failure = pool.client.queries.find((query) => query.text.includes("last_error = $4"));
    expect(failure?.values).toEqual(["1", 1, false, "LCD smart query failed: 500 unavailable", 5]);
  });

  it("marks permanent failures without retrying", async () => {
    const pool = new FakeSnapshotPool();
    const rest = { poolState: async () => { throw new Error("LCD smart query failed: 404 Not Found"); } };

    await expect(new SnapshotWorker(config, pool as never, rest, { maxAttempts: 5 }).processBatch()).resolves.toBe(1);

    const failure = pool.client.queries.find((query) => query.text.includes("last_error = $4"));
    expect(failure?.values).toEqual(["1", 1, true, "LCD smart query failed: 404 Not Found", 5]);
    expect(isPermanentSnapshotFailure(new Error("LCD smart query failed: 404 Not Found"))).toBe(true);
    expect(isPermanentSnapshotFailure(new Error("LCD smart query failed: 429 Too Many Requests"))).toBe(false);
  });
});
