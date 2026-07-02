import { loadConfig } from "./config.js";
import { Indexer } from "./indexer.js";

const config = loadConfig();
const indexer = new Indexer(config);

process.on("SIGINT", async () => {
  await indexer.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await indexer.close();
  process.exit(0);
});

await indexer.runForever();
