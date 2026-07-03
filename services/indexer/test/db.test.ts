import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { recordProcessedBlock, runMigrations } from "../src/db.js";

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
    return { rows: [], rowCount: 1 };
  }
}

describe("migration runner", () => {
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
