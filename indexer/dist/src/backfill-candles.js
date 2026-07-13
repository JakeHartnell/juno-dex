import { loadConfig } from "./config.js";
import { backfillTokenCandles, createPool } from "./db.js";
const args = new Map();
for (const arg of process.argv.slice(2)) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key)
        args.set(key, value);
}
const config = loadConfig();
const pool = createPool(config);
const client = await pool.connect();
try {
    const processed = await backfillTokenCandles(client, {
        chainId: args.get("chain-id") ?? config.chainId,
        pairAddress: args.get("pair") || undefined,
        from: args.get("from") || undefined,
        to: args.get("to") || undefined,
        batchSize: args.get("limit") ? Number(args.get("limit")) : undefined,
    });
    console.log(`backfilled candle inputs processed=${processed}`);
}
finally {
    client.release();
    await pool.end();
}
