import { loadConfig } from "./config.js";
import { createPool, runMigrations } from "./db.js";

const config = loadConfig();
const pool = createPool(config);
try {
  const applied = await runMigrations(pool);
  console.log(`migrations checked: ${applied.join(", ")}`);
} finally {
  await pool.end();
}
