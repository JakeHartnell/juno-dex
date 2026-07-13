import { hostname } from "node:os";
import { loadConfig } from "./config.js";
import { createPool, processNextCandleJob, type PgClient } from "./db.js";

const args = new Set(process.argv.slice(2));
const config = loadConfig();
const pool = createPool(config);

const workerId = process.env.CANDLE_WORKER_ID ?? `${hostname()}:${process.pid}`;
const pollMs = Number(process.env.CANDLE_WORKER_POLL_MS ?? config.pollIntervalMs);
const batchSize = Number(process.env.CANDLE_WORKER_BATCH_SIZE ?? 2_147_483_647);
const staleAfterMs = Number(process.env.CANDLE_WORKER_STALE_AFTER_MS ?? 10 * 60 * 1000);

async function withClient<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function runOnce(): Promise<boolean> {
  const job = await withClient((client) => processNextCandleJob(client, {
    chainId: config.chainId,
    workerId,
    batchSize,
    staleAfterMs,
  }));
  if (!job) return false;
  console.log(`candle worker processed job=${job.id} pair=${job.pairAddress} from=${job.fromTime} to=${job.toTime}`);
  return true;
}

try {
  if (args.has("--once")) {
    await runOnce();
  } else {
    for (;;) {
      const processed = await runOnce();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
} finally {
  await pool.end();
}
