import { describe, expect, it } from "vitest";
import { Indexer } from "../src/indexer.js";
import { parseNonNegativeInteger, nextBlockRange } from "../src/ranges.js";
import type { IndexerConfig } from "../src/config.js";

const testConfig: IndexerConfig = {
  databaseUrl: "postgres://postgres:***@localhost:5432/astroport_indexer_test",
  rpcUrl: "http://127.0.0.1:26657",
  restUrl: "http://127.0.0.1:1317",
  wsUrl: "ws://127.0.0.1:26657/websocket",
  chainId: "juno-1",
  factoryAddress: "juno1factory",
  routerAddress: "juno1router",
  incentivesAddress: "juno1incentives",
  oracleAddress: "juno1oracle",
  nativeCoinRegistryAddress: "juno1registry",
  startHeight: 100,
  confirmationDepth: 2,
  pollIntervalMs: 1,
  batchSize: 20,
  dryRun: true,
  cursorId: "test",
  indexerMode: "realtime",
  rangeSize: 5_000,
  fetchWindowSize: 250,
  fetchConcurrency: 32,
  realtimeFetchConcurrency: 8,
  rpcTimeoutMs: 10_000,
  rpcMaxRetries: 5,
  ingestCandlesInline: true,
  ingestReserveSnapshotsInline: true,
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

class StubIndexer extends Indexer {
  constructor(private readonly result: Awaited<ReturnType<Indexer["runOnce"]>> & { cursorHeight?: number }) {
    super(testConfig);
  }

  override async runOnce(): Promise<Awaited<ReturnType<Indexer["runOnce"]>> & { cursorHeight?: number }> {
    return this.result;
  }
}

describe("bounded CLI integer parsing", () => {
  it("rejects partially numeric values instead of truncating them", () => {
    expect(parseNonNegativeInteger("39381355", "to-height")).toBe(39381355);
    expect(() => parseNonNegativeInteger("123abc", "to-height")).toThrow(/to-height must be a non-negative integer/i);
    expect(() => parseNonNegativeInteger("-1", "to-height")).toThrow(/to-height must be a non-negative integer/i);
  });
});

describe("bounded backfill completion", () => {
  it("does not mark the range complete until the cursor reaches the requested max height", async () => {
    const indexer = new StubIndexer({ processed: 20, head: 200, target: 150, cursorHeight: 120 });

    await expect(indexer.runUntilHeight(150)).resolves.toMatchObject({ processed: 20, cursorHeight: 120, done: false });
  });

  it("fails instead of silently succeeding when the confirmed target is below the requested max height", async () => {
    const indexer = new StubIndexer({ processed: 0, head: 121, target: 119, cursorHeight: 119 });

    await expect(indexer.runUntilHeight(150)).rejects.toThrow(/confirmed target 119 is below requested to-height 150/i);
  });
});

describe("nextBlockRange", () => {
  it("returns an empty range when the confirmed target is behind the next cursor height", () => {
    expect(nextBlockRange({ lastHeight: 100, confirmedTarget: 100, batchSize: 20 })).toEqual({ from: 101, to: 100, empty: true });
  });

  it("limits the next range by batch size", () => {
    expect(nextBlockRange({ lastHeight: 100, confirmedTarget: 150, batchSize: 20 })).toEqual({ from: 101, to: 120, empty: false });
  });

  it("caps the next range at an explicit backfill end height", () => {
    expect(nextBlockRange({ lastHeight: 100, confirmedTarget: 150, batchSize: 20, maxHeight: 110 })).toEqual({ from: 101, to: 110, empty: false });
  });

  it("returns empty after the explicit backfill end height has been reached", () => {
    expect(nextBlockRange({ lastHeight: 110, confirmedTarget: 150, batchSize: 20, maxHeight: 110 })).toEqual({ from: 111, to: 110, empty: true });
  });
});
