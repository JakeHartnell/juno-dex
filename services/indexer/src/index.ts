import { createIndexerApi } from "./api.js";
import { PostgresApiStore } from "./api-store.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { Indexer } from "./indexer.js";

const config = loadConfig();
const pool = createPool(config);
const api = createIndexerApi(new PostgresApiStore(pool, config.chainId, config.cursorId, { rpcUrl: config.rpcUrl, expectedMigrationCount: 3 }));
const indexer = new Indexer(config, pool);

await new Promise<void>((resolve) => api.listen(config.apiPort, resolve));
console.log(`astroport juno indexer api listening on :${config.apiPort}`);

async function shutdown(signal: string) {
  console.log(`received ${signal}; shutting down indexer`);
  await new Promise<void>((resolve, reject) => api.close((error) => (error ? reject(error) : resolve())));
  await indexer.close();
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await indexer.runForever();
