import { createIndexerApi } from "./api.js";
import { PostgresApiStore } from "./api-store.js";
import { loadConfig } from "./config.js";
import { createPool, listMigrationFiles, runMigrations } from "./db.js";
import { Indexer } from "./indexer.js";
import { indexerMetrics } from "./metrics.js";
import { ReadModelRefresher } from "./read-model-refresher.js";

const config = loadConfig();
const pool = createPool(config);
const appliedMigrations = await runMigrations(pool);
console.log(`migrations checked: ${appliedMigrations.join(", ")}`);
const expectedMigrationVersions = await listMigrationFiles();
const api = createIndexerApi(new PostgresApiStore(pool, config.chainId, config.cursorId, { rpcUrl: config.rpcUrl, expectedMigrationVersions, confirmationDepth: config.confirmationDepth }), indexerMetrics);
const indexer = new Indexer(config, pool, indexerMetrics);
const readModels = new ReadModelRefresher(pool, { chainId: config.chainId, intervalMs: config.readModelRefreshIntervalMs });

await readModels.refreshOnce().catch((error) => {
  console.warn("indexer_read_models_initial_refresh_failed", { error: error instanceof Error ? error.message : String(error) });
});
readModels.start();

await new Promise<void>((resolve) => api.listen(config.apiPort, resolve));
console.log(`astroport juno indexer api listening on :${config.apiPort}`);

async function shutdown(signal: string) {
  console.log(`received ${signal}; shutting down indexer`);
  readModels.stop();
  await new Promise<void>((resolve, reject) => api.close((error) => (error ? reject(error) : resolve())));
  await indexer.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await indexer.runForever();
