import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { backfillTokenCandles, claimSnapshotJobs, enqueueSnapshotJobs, listMigrationFiles, markSnapshotJobFailed, markSnapshotJobSucceeded, processNextCandleJob, recordProcessedBlock, refreshApiReadModels, runMigrations, stageAndMergeBatch, upsertPoolStateSnapshot, writeNormalizedEvent, writeNormalizedEvents } from "../src/db.js";

type Query = { text: string; values?: unknown[] };

class FakeMigrationPool {
  queries: Query[] = [];
  applied = new Set<string>();

  async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.queries.push({ text, values });
    if (text === "SELECT version FROM schema_migrations") {
      return { rows: [...this.applied].map((version) => ({ version }) as T) };
    }
    if (text.startsWith("INSERT INTO schema_migrations")) {
      this.applied.add(String(values?.[0]));
      return { rows: [] };
    }
    return { rows: [] };
  }
}

class FakeBlockClient {
  rowsByKey = new Map<string, unknown[]>();
  queries: Query[] = [];
  nextWriteRowCount = 1;

  async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (text.includes("FROM processed_blocks") && text.includes("height = $2 - 1")) {
      const rows = (this.rowsByKey.get(`previous:${String(values?.[1])}`) ?? []) as T[];
      return { rows, rowCount: rows.length };
    }
    if (text.includes("FROM processed_blocks") && text.includes("height = $2")) {
      const rows = (this.rowsByKey.get(`existing:${String(values?.[1])}`) ?? []) as T[];
      return { rows, rowCount: rows.length };
    }
    if (text.includes("INSERT INTO processed_blocks")) return { rows: [], rowCount: this.nextWriteRowCount };
    if (text.includes("INSERT INTO pool_state_snapshots")) return { rows: [], rowCount: 1 };
    if (text.includes("INSERT INTO snapshot_jobs")) return { rows: [], rowCount: 1 };
    if (text.includes("WITH claimable")) return { rows: [{ id: "7", chain_id: "juno-1", pair_address: "juno1pair", height: "39381355", block_time: "2026-07-01T03:01:00Z", reason: "touched", status: "leased", attempts: 1 }] as T[], rowCount: 1 };
    if (text.includes("UPDATE snapshot_jobs")) return { rows: [], rowCount: 1 };
    if (text.includes("FROM pools") && text.includes("pair_address")) {
      const rows = (this.rowsByKey.get(`pool:${String(values?.[1])}`) ?? []) as T[];
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 1 };
  }
}

class FakeCandleClient {
  queries: Query[] = [];

  constructor(
    private readonly metadataRows: Array<{ asset: string; decimals: number | string | null }> = [{ asset: "ujuno", decimals: 6 }, { asset: "factory/token18", decimals: 18 }],
    private readonly swapRow: Record<string, string> = { pair_address: "juno1pair", block_time: "2026-07-01T03:01:00Z", offer_asset: "factory/backfill18", offer_amount: "2000000000000000000", ask_asset: "ujuno-backfill", return_amount: "3000000", height: "39381355", tx_hash: "tx", msg_index: "0", event_index: "0" },
    private poolRows: Array<{ id: string; pair_address?: string }> = [{ id: "pool-1", pair_address: "juno1pair" }],
  ) {}

  async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (text.includes("INSERT INTO pools")) {
      this.poolRows = [{ id: "pool-created", pair_address: String(values?.[1]) }, ...this.poolRows];
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("INSERT INTO swaps")) return { rows: [{ id: "swap-1", pool_id: values?.[1] ?? null }] as T[], rowCount: 1 };
    if (text.includes("INSERT INTO candle_jobs")) return { rows: [], rowCount: 1 };
    if (text.includes("WITH next_job")) return { rows: [{ id: "job-1", chain_id: "juno-1", pair_address: "juno1pair", from_time: "2026-07-01T00:00:00.000Z", to_time: "2026-07-02T00:00:00.000Z", attempts: 1, worker_id: values?.[1] }] as T[], rowCount: 1 };
    if (text.includes("UPDATE candle_jobs")) return { rows: [], rowCount: 1 };
    if (text.includes("FROM swaps")) return { rows: [this.swapRow] as T[], rowCount: 1 };
    if (text.includes("FROM asset_metadata")) {
      const requested = new Set((values?.[1] as string[]) ?? []);
      const rows = this.metadataRows.filter((row) => requested.has(row.asset));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (text.includes("FROM pools") && text.includes("pair_address")) {
      const pairAddress = String(values?.[1]);
      const rows = this.poolRows.filter((row) => row.pair_address === pairAddress || row.pair_address === undefined);
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (text.includes("INSERT INTO token_candles")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }
}

class FakeStageClient {
  queries: Query[] = [];
  processedBlockRowCount = 1;
  previousBlockHash?: string;

  async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (text.includes("FROM processed_blocks") && text.includes("height = $2")) {
      const rows = this.previousBlockHash ? [{ block_hash: this.previousBlockHash }] as T[] : [];
      return { rows, rowCount: rows.length };
    }
    if (text.includes("INSERT INTO processed_blocks")) return { rows: [], rowCount: this.processedBlockRowCount };
    return { rows: [], rowCount: 1 };
  }
}

describe("migration runner", () => {
  it("lists repository migrations from the default runtime path", async () => {
    await expect(listMigrationFiles()).resolves.toEqual([
      "001_init.sql",
      "002_pool_candles.sql",
      "003_api_pricing_readiness.sql",
      "004_pool_state_source_precedence.sql",
      "005_snapshot_jobs.sql",
      "006_candle_jobs.sql",
      "007_bulk_staging.sql",
      "008_read_models.sql",
      "009_juno_stats_derivation.sql",
    ]);
  });

  it("lists only SQL migrations in deterministic order", async () => {
    const dir = await mkdtemp(join(tmpdir(), "juno-indexer-migration-list-"));
    await writeFile(join(dir, "002_next.sql"), "SELECT 2;");
    await writeFile(join(dir, "README.md"), "not a migration");
    await writeFile(join(dir, "001_init.sql"), "SELECT 1;");

    await expect(listMigrationFiles(dir)).resolves.toEqual(["001_init.sql", "002_next.sql"]);
  });

  it("records migrations once and skips already-applied files on subsequent runs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "juno-indexer-migrations-"));
    await writeFile(join(dir, "001_init.sql"), "SELECT 1;");
    await writeFile(join(dir, "002_next.sql"), "SELECT 2;");
    const pool = new FakeMigrationPool();

    await expect(runMigrations(pool as never, dir)).resolves.toEqual(["001_init.sql", "002_next.sql"]);
    const firstRunSqlExecutions = pool.queries.filter((query) => query.text === "SELECT 1;" || query.text === "SELECT 2;");
    expect(firstRunSqlExecutions).toHaveLength(2);

    pool.queries = [];
    await expect(runMigrations(pool as never, dir)).resolves.toEqual([]);
    const secondRunSqlExecutions = pool.queries.filter((query) => query.text === "SELECT 1;" || query.text === "SELECT 2;");
    expect(secondRunSqlExecutions).toHaveLength(0);
  });
});

describe("processed block recording", () => {
  it("rejects a conflicting block hash for an already processed height", async () => {
    const client = new FakeBlockClient();
    client.rowsByKey.set("existing:39381305", [{ block_hash: "old-hash", parent_hash: "parent" }]);

    await expect(recordProcessedBlock(client as never, {
      chainId: "juno-1",
      height: 39381305,
      blockHash: "new-hash",
      parentHash: "parent",
      blockTime: "2026-07-01T03:00:00Z",
      txCount: 1,
    })).rejects.toThrow(/block hash mismatch/i);
  });

  it("rejects a parent-hash mismatch against the previous processed block", async () => {
    const client = new FakeBlockClient();
    client.rowsByKey.set("previous:39381306", [{ block_hash: "expected-parent" }]);

    await expect(recordProcessedBlock(client as never, {
      chainId: "juno-1",
      height: 39381306,
      blockHash: "child-hash",
      parentHash: "different-parent",
      blockTime: "2026-07-01T03:00:06Z",
      txCount: 1,
    })).rejects.toThrow(/parent hash mismatch/i);
  });

  it("rejects an atomic write conflict when the guarded upsert affects no rows", async () => {
    const client = new FakeBlockClient();
    client.nextWriteRowCount = 0;

    await expect(recordProcessedBlock(client as never, {
      chainId: "juno-1",
      height: 39381307,
      blockHash: "late-conflict-hash",
      parentHash: "parent",
      blockTime: "2026-07-01T03:00:12Z",
      txCount: 1,
    })).rejects.toThrow(/processed block conflict/i);

    const insert = client.queries.find((query) => query.text.includes("INSERT INTO processed_blocks"));
    expect(insert?.text).toContain("WHERE processed_blocks.chain_id = EXCLUDED.chain_id");
    expect(insert?.text).toContain("processed_blocks.block_hash = EXCLUDED.block_hash");
  });
});

describe("bulk staging merge writer", () => {
  it("stages decoded rows, merges canonical tables in dependency order, and advances the cursor after merge SQL", async () => {
    const client = new FakeStageClient();

    await stageAndMergeBatch(client as never, {
      batchId: "00000000-0000-4000-8000-000000000001",
      chainId: "juno-1",
      cursorId: "astroport-juno-v1",
      writeCandlesInline: false,
      enqueueSnapshots: true,
      blocks: [{
        chainId: "juno-1",
        height: 39381355,
        blockHash: "block-39381355",
        parentHash: "block-39381354",
        blockTime: "2026-07-01T03:01:00Z",
        txCount: 1,
        events: [
          { kind: "pool_created", chainId: "juno-1", height: 39381355, blockTime: "2026-07-01T03:01:00Z", txHash: "tx", msgIndex: 0, eventIndex: 0, factoryAddress: "juno1factory", pairAddress: "juno1pair", assetInfos: ["ujuno", "uusdc"], raw: {} },
          { kind: "swap", chainId: "juno-1", height: 39381355, blockTime: "2026-07-01T03:01:00Z", txHash: "tx", msgIndex: 0, eventIndex: 1, pairAddress: "juno1pair", trader: "juno1trader", offerAsset: "ujuno", offerAmount: "1", askAsset: "uusdc", returnAmount: "2", raw: {} },
          { kind: "provide", chainId: "juno-1", height: 39381355, blockTime: "2026-07-01T03:01:00Z", txHash: "tx", msgIndex: 0, eventIndex: 2, pairAddress: "juno1pair", provider: "juno1provider", assets: [{ asset: "ujuno", amount: "1" }], shareAmount: "1", raw: {} },
          { kind: "incentive", chainId: "juno-1", height: 39381355, blockTime: "2026-07-01T03:01:00Z", txHash: "tx", msgIndex: 0, eventIndex: 3, incentivesAddress: "juno1incentives", action: "bond", userAddress: "juno1user", amount: "1", raw: {} },
        ],
      }],
    });

    expect(client.queries.some((query) => query.text.includes("INSERT INTO stage_processed_blocks"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO stage_pools"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO stage_swaps"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO stage_liquidity_events"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO stage_incentive_events"))).toBe(true);

    const processedMergeIndex = client.queries.findIndex((query) => query.text.includes("INSERT INTO processed_blocks"));
    const poolMergeIndex = client.queries.findIndex((query) => query.text.includes("INSERT INTO pools") && query.text.includes("FROM stage_pools"));
    const swapMergeIndex = client.queries.findIndex((query) => query.text.includes("INSERT INTO swaps") && query.text.includes("FROM stage_swaps"));
    const cursorIndex = client.queries.findIndex((query) => query.text.includes("UPDATE indexer_cursors"));
    expect(processedMergeIndex).toBeGreaterThanOrEqual(0);
    expect(poolMergeIndex).toBeGreaterThan(processedMergeIndex);
    expect(swapMergeIndex).toBeGreaterThan(poolMergeIndex);
    expect(cursorIndex).toBeGreaterThan(swapMergeIndex);
    expect(client.queries[cursorIndex]?.values).toEqual(["astroport-juno-v1", 39381355, "block-39381355"]);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO candle_jobs"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO snapshot_jobs"))).toBe(true);
  });

  it("does not advance the cursor when a staging merge detects a processed block conflict", async () => {
    const client = new FakeStageClient();
    client.processedBlockRowCount = 0;

    await expect(stageAndMergeBatch(client as never, {
      batchId: "00000000-0000-4000-8000-000000000002",
      chainId: "juno-1",
      cursorId: "astroport-juno-v1",
      blocks: [{ chainId: "juno-1", height: 12, blockHash: "new", parentHash: "old", blockTime: "2026-07-01T03:01:00Z", txCount: 0, events: [] }],
    })).rejects.toThrow(/processed block conflict/);

    expect(client.queries.some((query) => query.text.includes("UPDATE indexer_cursors"))).toBe(false);
  });

  it("rejects non-contiguous or forked staged block ranges before advancing the cursor", async () => {
    const client = new FakeStageClient();

    await expect(stageAndMergeBatch(client as never, {
      batchId: "00000000-0000-4000-8000-000000000003",
      chainId: "juno-1",
      cursorId: "astroport-juno-v1",
      blocks: [
        { chainId: "juno-1", height: 12, blockHash: "block-12", parentHash: "block-11", blockTime: "2026-07-01T03:01:00Z", txCount: 0, events: [] },
        { chainId: "juno-1", height: 13, blockHash: "block-13", parentHash: "different-parent", blockTime: "2026-07-01T03:01:06Z", txCount: 0, events: [] },
      ],
    })).rejects.toThrow(/parent hash mismatch/);
    expect(client.queries.some((query) => query.text.includes("UPDATE indexer_cursors"))).toBe(false);

    const previousClient = new FakeStageClient();
    previousClient.previousBlockHash = "canonical-11";
    await expect(stageAndMergeBatch(previousClient as never, {
      batchId: "00000000-0000-4000-8000-000000000004",
      chainId: "juno-1",
      cursorId: "astroport-juno-v1",
      blocks: [{ chainId: "juno-1", height: 12, blockHash: "block-12", parentHash: "fork-11", blockTime: "2026-07-01T03:01:00Z", txCount: 0, events: [] }],
    })).rejects.toThrow(/parent hash mismatch/);
    expect(previousClient.queries.some((query) => query.text.includes("UPDATE indexer_cursors"))).toBe(false);
  });
});

describe("swap candle writes", () => {
  it("uses asset_metadata decimals for indexer candle price and volume math", async () => {
    const client = new FakeCandleClient();

    await writeNormalizedEvent(client as never, "juno-1", {
      kind: "swap",
      chainId: "juno-1",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      txHash: "tx",
      msgIndex: 0,
      eventIndex: 0,
      pairAddress: "juno1pair",
      offerAsset: "factory/token18",
      offerAmount: "2000000000000000000",
      askAsset: "ujuno",
      returnAmount: "3000000",
      raw: {},
    });

    const swapInsert = client.queries.find((query) => query.text.includes("INSERT INTO swaps"));
    expect(swapInsert?.values?.slice(0, 4)).toEqual(["juno-1", "pool-1", "juno1pair", 39381355]);
    const metadata = client.queries.find((query) => query.text.includes("FROM asset_metadata"));
    expect(metadata?.values).toEqual(["juno-1", ["factory/token18", "ujuno"]]);
    const candleInsert = client.queries.find((query) => query.text.includes("INSERT INTO token_candles"));
    expect(candleInsert?.values?.slice(3, 10)).toEqual(["factory/token18", "ujuno", "5m", "2026-07-01T03:00:00.000Z", "1.5", "2", "3"]);
  });

  it("skips candle writes when inline candle option is disabled", async () => {
    const client = new FakeCandleClient();

    await writeNormalizedEvent(client as never, "juno-1", {
      kind: "swap",
      chainId: "juno-1",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      txHash: "tx",
      msgIndex: 0,
      eventIndex: 0,
      pairAddress: "juno1pair",
      offerAsset: "factory/token18",
      offerAmount: "2000000000000000000",
      askAsset: "ujuno",
      returnAmount: "3000000",
      raw: {},
    }, { writeCandlesInline: false });

    expect(client.queries.some((query) => query.text.includes("INSERT INTO swaps"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO candle_jobs"))).toBe(true);
    const jobInsert = client.queries.find((query) => query.text.includes("INSERT INTO candle_jobs"));
    expect(jobInsert?.values).toEqual(["juno-1", "juno1pair", "2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z"]);
    expect(client.queries.some((query) => query.text.includes("FROM asset_metadata"))).toBe(false);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO token_candles"))).toBe(false);
  });

  it("skips candle writes when either swap asset lacks valid decimals", async () => {
    const client = new FakeCandleClient([{ asset: "factory/missing18", decimals: 18 }, { asset: "ujuno-missing", decimals: null }]);

    await writeNormalizedEvent(client as never, "juno-1", {
      kind: "swap",
      chainId: "juno-1",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      txHash: "tx",
      msgIndex: 0,
      eventIndex: 0,
      pairAddress: "juno1pair",
      offerAsset: "factory/missing18",
      offerAmount: "2000000000000000000",
      askAsset: "ujuno-missing",
      returnAmount: "3000000",
      raw: {},
    });

    expect(client.queries.some((query) => query.text.includes("INSERT INTO swaps"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO token_candles"))).toBe(false);
  });

  it("uses decimals for candle backfills and skips degraded metadata", async () => {
    const okClient = new FakeCandleClient([{ asset: "factory/backfill18", decimals: 18 }, { asset: "ujuno-backfill", decimals: 6 }]);
    await expect(backfillTokenCandles(okClient as never, { chainId: "juno-1" })).resolves.toBe(1);
    const backfillInsert = okClient.queries.find((query) => query.text.includes("INSERT INTO token_candles"));
    expect(backfillInsert?.values?.slice(3, 15)).toEqual(["factory/backfill18", "ujuno-backfill", "5m", "2026-07-01T03:00:00.000Z", "1.5", "1.5", "1.5", "1.5", "2", "3", 1, "backfill"]);

    const badClient = new FakeCandleClient(
      [{ asset: "factory/backfill-bad18", decimals: 309 }, { asset: "ujuno-backfill-bad", decimals: 6 }],
      { pair_address: "juno1pair", block_time: "2026-07-01T03:01:00Z", offer_asset: "factory/backfill-bad18", offer_amount: "2000000000000000000", ask_asset: "ujuno-backfill-bad", return_amount: "3000000", height: "39381355", tx_hash: "tx", msg_index: "0", event_index: "0" },
    );
    await expect(backfillTokenCandles(badClient as never, { chainId: "juno-1" })).resolves.toBe(1);
    expect(badClient.queries.some((query) => query.text.includes("INSERT INTO token_candles"))).toBe(false);
  });

  it("worker claims a candle job, rebuilds candles through shared helper, and marks completion", async () => {
    const client = new FakeCandleClient([{ asset: "factory/backfill18", decimals: 18 }, { asset: "ujuno-backfill", decimals: 6 }]);

    await expect(processNextCandleJob(client as never, { chainId: "juno-1", workerId: "worker-1" })).resolves.toMatchObject({
      id: "job-1",
      pairAddress: "juno1pair",
    });

    const claim = client.queries.find((query) => query.text.includes("FOR UPDATE SKIP LOCKED"));
    expect(claim?.values?.slice(0, 2)).toEqual(["juno-1", "worker-1"]);
    const swapRead = client.queries.find((query) => query.text.includes("FROM swaps"));
    expect(swapRead?.text).toContain("ORDER BY height ASC, msg_index ASC, event_index ASC, id ASC");
    expect(swapRead?.values).toEqual(["juno-1", "juno1pair", "2026-07-01T00:00:00.000Z", "2026-07-02T00:00:00.000Z", 2147483647, true]);
    const candleInsert = client.queries.find((query) => query.text.includes("INSERT INTO token_candles"));
    expect(candleInsert?.values?.slice(3, 15)).toEqual(["factory/backfill18", "ujuno-backfill", "5m", "2026-07-01T03:00:00.000Z", "1.5", "1.5", "1.5", "1.5", "2", "3", 1, "worker"]);
    const complete = client.queries.find((query) => query.text.includes("rerun_requested"));
    expect(complete?.text).toContain("AND status = 'running'");
    expect(complete?.text).toContain("AND worker_id = $2");
    expect(complete?.text).toContain("AND attempts = $3");
    expect(complete?.values).toEqual(["job-1", "worker-1", 1, 1]);
  });
  it("writes pool discovery before same-batch pair events regardless of emitted order", async () => {
    const client = new FakeCandleClient(undefined, undefined, []);

    await writeNormalizedEvents(client as never, "juno-1", [
      {
        kind: "swap",
        chainId: "juno-1",
        height: 39381355,
        blockTime: "2026-07-01T03:01:00Z",
        txHash: "tx",
        msgIndex: 0,
        eventIndex: 0,
        pairAddress: "juno1newpair",
        offerAsset: "factory/token18",
        offerAmount: "2000000000000000000",
        askAsset: "ujuno",
        returnAmount: "3000000",
        raw: {},
      },
      {
        kind: "pool_created",
        chainId: "juno-1",
        height: 39381355,
        blockTime: "2026-07-01T03:01:00Z",
        txHash: "tx",
        msgIndex: 0,
        eventIndex: 1,
        factoryAddress: "juno1factory",
        pairAddress: "juno1newpair",
        assetInfos: ["factory/token18", "ujuno"],
        raw: {},
      },
    ]);

    const poolInsertIndex = client.queries.findIndex((query) => query.text.includes("INSERT INTO pools"));
    const swapInsertIndex = client.queries.findIndex((query) => query.text.includes("INSERT INTO swaps"));
    expect(poolInsertIndex).toBeGreaterThanOrEqual(0);
    expect(swapInsertIndex).toBeGreaterThan(poolInsertIndex);
    const swapInsert = client.queries[swapInsertIndex];
    expect(swapInsert?.values?.slice(0, 4)).toEqual(["juno-1", "pool-created", "juno1newpair", 39381355]);
  });

  it("skips swap persistence for unknown pair contracts", async () => {
    const client = new FakeCandleClient(undefined, undefined, []);

    await writeNormalizedEvent(client as never, "juno-1", {
      kind: "swap",
      chainId: "juno-1",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      txHash: "tx",
      msgIndex: 0,
      eventIndex: 0,
      pairAddress: "juno1unrelated",
      offerAsset: "factory/token18",
      offerAmount: "2000000000000000000",
      askAsset: "ujuno",
      returnAmount: "3000000",
      raw: {},
    });

    expect(client.queries.some((query) => query.text.includes("FROM pools"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO swaps"))).toBe(false);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO token_candles"))).toBe(false);
  });

  it("writes known liquidity events with pool_id", async () => {
    const client = new FakeCandleClient();

    await writeNormalizedEvent(client as never, "juno-1", {
      kind: "provide",
      chainId: "juno-1",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      txHash: "tx-liq-known",
      msgIndex: 0,
      eventIndex: 1,
      pairAddress: "juno1pair",
      provider: "juno1provider",
      assets: [{ asset: "ujuno", amount: "1" }],
      shareAmount: "1",
      raw: {},
    });

    const insert = client.queries.find((query) => query.text.includes("INSERT INTO liquidity_events"));
    expect(insert?.values?.slice(0, 4)).toEqual(["juno-1", "pool-1", "juno1pair", 39381355]);
  });

  it("skips liquidity persistence for unknown pair contracts", async () => {
    const client = new FakeCandleClient(undefined, undefined, []);

    await writeNormalizedEvent(client as never, "juno-1", {
      kind: "provide",
      chainId: "juno-1",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      txHash: "tx-liq",
      msgIndex: 0,
      eventIndex: 1,
      pairAddress: "juno1unrelated",
      provider: "juno1provider",
      assets: [{ asset: "ujuno", amount: "1" }],
      shareAmount: "1",
      raw: {},
    });

    expect(client.queries.some((query) => query.text.includes("FROM pools"))).toBe(true);
    expect(client.queries.some((query) => query.text.includes("INSERT INTO liquidity_events"))).toBe(false);
  });
});

describe("pool state snapshots", () => {
  it("enqueues reserve snapshot jobs idempotently for known pools only", async () => {
    const client = new FakeBlockClient();

    await expect(enqueueSnapshotJobs(client as never, {
      chainId: "juno-1",
      pairAddresses: ["juno1pair", "juno1pair", "juno1missing"],
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      reason: "touched",
    })).resolves.toBe(1);

    const insert = client.queries.find((query) => query.text.includes("INSERT INTO snapshot_jobs"));
    expect(insert?.text).toContain("FROM pools p");
    expect(insert?.text).toContain("ON CONFLICT (chain_id, pair_address, height, reason) DO NOTHING");
    expect(insert?.values).toEqual(["juno-1", ["juno1pair", "juno1missing"], 39381355, "2026-07-01T03:01:00Z", "touched"]);
  });

  it("claims snapshot jobs with skip-locked leases and updates terminal state", async () => {
    const client = new FakeBlockClient();

    await expect(claimSnapshotJobs(client as never, { chainId: "juno-1", limit: 10, leaseSeconds: 30, maxAttempts: 5 })).resolves.toEqual([
      { id: "7", chainId: "juno-1", pairAddress: "juno1pair", height: 39381355, blockTime: "2026-07-01T03:01:00Z", reason: "touched", status: "leased", attempts: 1 },
    ]);
    await markSnapshotJobSucceeded(client as never, { jobId: "7", attempt: 1 });
    await markSnapshotJobFailed(client as never, { jobId: "8", attempt: 2, error: "temporary", permanent: false, maxAttempts: 5 });

    const claim = client.queries.find((query) => query.text.includes("WITH claimable"));
    expect(claim?.text).toContain("FOR UPDATE SKIP LOCKED");
    expect(claim?.values).toEqual(["juno-1", 10, "30 seconds", 5]);
    const success = client.queries.find((query) => query.text.includes("status = 'succeeded'"));
    expect(success?.text).toContain("AND status = 'leased'");
    expect(success?.text).toContain("AND attempts = $2");
    expect(success?.values).toEqual(["7", 1]);
    const failure = client.queries.find((query) => query.text.includes("last_error = $4"));
    expect(failure?.text).toContain("AND status = 'leased'");
    expect(failure?.text).toContain("AND attempts = $2");
    expect(failure?.values).toEqual(["8", 2, false, "temporary", 5]);
  });

  it("upserts reserve snapshots idempotently by pool, height, and source", async () => {
    const client = new FakeBlockClient();
    client.rowsByKey.set("pool:juno1pair", [{ id: "pool-1" }]);

    await upsertPoolStateSnapshot(client as never, {
      chainId: "juno-1",
      pairAddress: "juno1pair",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      reserves: [{ denom: "ujuno", amount: "123" }, { denom: "uusdc", amount: "456" }],
      totalShare: "789",
      source: "event",
    });

    const select = client.queries.find((query) => query.text.includes("FROM pools"));
    expect(select?.values).toEqual(["juno-1", "juno1pair"]);
    const insert = client.queries.find((query) => query.text.includes("INSERT INTO pool_state_snapshots"));
    expect(insert?.text).toContain("ON CONFLICT (pool_id, height, source) DO UPDATE");
    expect(insert?.values).toEqual(["pool-1", 39381355, "2026-07-01T03:01:00Z", JSON.stringify([{ denom: "ujuno", amount: "123" }, { denom: "uusdc", amount: "456" }]), "789", "event"]);
  });

  it("rejects snapshots for unknown pools instead of writing orphan state", async () => {
    const client = new FakeBlockClient();

    await expect(upsertPoolStateSnapshot(client as never, {
      chainId: "juno-1",
      pairAddress: "juno1missing",
      height: 39381355,
      blockTime: "2026-07-01T03:01:00Z",
      reserves: [],
    })).rejects.toThrow(/unknown pair juno1missing/i);
  });
});

describe("API read model refresh", () => {
  it("calls the SQL refresh helper and maps affected rows", async () => {
    const client = {
      queries: [] as Query[],
      async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
        this.queries.push({ text, values });
        return { rows: [{ model: "latest_pool_state", rows_affected: "1" }, { model: "protocol_stats_latest", rows_affected: 1 }] as T[], rowCount: 2 };
      },
    };

    await expect(refreshApiReadModels(client as never, { chainId: "juno-1" })).resolves.toEqual([
      { model: "latest_pool_state", rowsAffected: 1 },
      { model: "protocol_stats_latest", rowsAffected: 1 },
    ]);
    expect(client.queries[0]).toEqual({ text: "SELECT model, rows_affected FROM refresh_api_read_models($1::text)", values: ["juno-1"] });
  });
});
