import { loadConfig } from "./config.js";
import { createPool, refreshApiReadModels } from "./db.js";

const config = loadConfig();
const pool = createPool(config);
const client = await pool.connect();

try {
  const results = await refreshApiReadModels(client, { chainId: config.chainId });
  for (const result of results) {
    console.log(`read_model_refreshed model=${result.model} rows=${result.rowsAffected}`);
  }
} finally {
  client.release();
  await pool.end();
}
