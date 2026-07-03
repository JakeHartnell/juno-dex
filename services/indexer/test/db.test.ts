import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../src/db.js";

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
