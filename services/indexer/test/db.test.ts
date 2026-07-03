import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { backfillTokenCandles, listMigrationFiles, recordProcessedBlock, runMigrations, upsertPoolStateSnapshot, writeNormalizedEvent } from "../src/db.js";

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
    if (text.includes("FROM pools") && text.includes("pair_address")) {
      const rows = (this.rowsByKey.get(`pool:${String(values?.[1])}`) ?? []) as T[];
      return { rows, rowCount: rows.length };
    }
    if (text.includes("INSERT INTO pool_state_snapshots")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }
}

class FakeCandleClient {
  queries: Query[] = [];

  constructor(
    private readonly metadataRows: Array<{ asset: string; decimals: number | string | null }> = [{ asset: "ujuno", decimals: 6 }, { asset: "factory/token18", decimals: 18 }],
    private readonly swapRow: Record<string, string> = { pair_address: "juno1pair", block_time: "2026-07-01T03:01:00Z", offer_asset: "factory/backfill18", offer_amount: "2000000000000000000", ask_asset: "ujuno-backfill", return_amount: "3000000", height: "39381355", tx_hash: "tx", msg_index: "0", event_index: "0" },
  ) {}

  async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (text.includes("INSERT INTO swaps")) return { rows: [], rowCount: 1 };
    if (text.includes("FROM swaps")) return { rows: [this.swapRow] as T[], rowCount: 1 };
    if (text.includes("FROM asset_metadata")) {
      const requested = new Set((values?.[1] as string[]) ?? []);
      const rows = this.metadataRows.filter((row) => requested.has(row.asset));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (text.includes("FROM pools") && text.includes("pair_address")) return { rows: [{ id: "pool-1" }] as T[], rowCount: 1 };
    if (text.includes("INSERT INTO token_candles")) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }
}

describe("migration runner", () => {
  it("lists repository migrations from the default runtime path", async () => {
    await expect(listMigrationFiles()).resolves.toEqual([
      "001_init.sql",
      "002_pool_candles.sql",
      "003_api_pricing_readiness.sql",
      "004_pool_state_source_precedence.sql",
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

    const metadata = client.queries.find((query) => query.text.includes("FROM asset_metadata"));
    expect(metadata?.values).toEqual(["juno-1", ["factory/token18", "ujuno"]]);
    const candleInsert = client.queries.find((query) => query.text.includes("INSERT INTO token_candles"));
    expect(candleInsert?.values?.slice(3, 10)).toEqual(["factory/token18", "ujuno", "5m", "2026-07-01T03:00:00.000Z", "1.5", "2", "3"]);
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
    expect(backfillInsert?.values?.slice(3, 14)).toEqual(["factory/backfill18", "ujuno-backfill", "5m", "2026-07-01T03:00:00.000Z", "1.5", "1.5", "1.5", "1.5", "2", "3", 1]);

    const badClient = new FakeCandleClient(
      [{ asset: "factory/backfill-bad18", decimals: 309 }, { asset: "ujuno-backfill-bad", decimals: 6 }],
      { pair_address: "juno1pair", block_time: "2026-07-01T03:01:00Z", offer_asset: "factory/backfill-bad18", offer_amount: "2000000000000000000", ask_asset: "ujuno-backfill-bad", return_amount: "3000000", height: "39381355", tx_hash: "tx", msg_index: "0", event_index: "0" },
    );
    await expect(backfillTokenCandles(badClient as never, { chainId: "juno-1" })).resolves.toBe(1);
    expect(badClient.queries.some((query) => query.text.includes("INSERT INTO token_candles"))).toBe(false);
  });
});

describe("pool state snapshots", () => {
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
