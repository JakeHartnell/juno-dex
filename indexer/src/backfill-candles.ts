import { loadConfig } from "./config.js";
import { backfillTokenCandles, createPool } from "./db.js";

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const [key, value = ""] = arg.replace(/^--/, "").split("=");
  if (key) args.set(key, value);
}

const config = loadConfig();
const pool = createPool(config);
const client = await pool.connect();
try {
  const chainId = args.get("chain-id") ?? config.chainId;
  const pairAddress = args.get("pair") || undefined;
  const from = args.get("from") || undefined;
  const to = args.get("to") || undefined;
  const processed = await backfillTokenCandles(client, {
    chainId,
    pairAddress,
    from,
    to,
    batchSize: args.get("limit") ? Number(args.get("limit")) : undefined,
  });
  console.log(`backfilled candle inputs processed=${processed}`);

  const diagnostics = await client.query<{
    swap_count: string;
    eligible_swap_count: string;
    missing_assets: string[] | null;
    token_candle_count: string;
  }>(
    `WITH selected_swaps AS (
       SELECT offer_asset, ask_asset
       FROM swaps
       WHERE chain_id = $1
         AND ($2::text IS NULL OR pair_address = $2)
         AND ($3::timestamptz IS NULL OR block_time >= $3)
         AND ($4::timestamptz IS NULL OR block_time <= $4)
     ),
     swap_assets AS (
       SELECT offer_asset AS asset FROM selected_swaps WHERE offer_asset IS NOT NULL
       UNION
       SELECT ask_asset AS asset FROM selected_swaps WHERE ask_asset IS NOT NULL
     ),
     asset_status AS (
       SELECT a.asset, m.decimals
       FROM swap_assets a
       LEFT JOIN asset_metadata m ON m.chain_id = $1 AND m.asset = a.asset
     ),
     eligible_swaps AS (
       SELECT 1
       FROM selected_swaps s
       JOIN asset_metadata offer_meta ON offer_meta.chain_id = $1 AND offer_meta.asset = s.offer_asset AND offer_meta.decimals BETWEEN 0 AND 36
       JOIN asset_metadata ask_meta ON ask_meta.chain_id = $1 AND ask_meta.asset = s.ask_asset AND ask_meta.decimals BETWEEN 0 AND 36
     )
     SELECT
       (SELECT count(*) FROM selected_swaps)::text AS swap_count,
       (SELECT count(*) FROM eligible_swaps)::text AS eligible_swap_count,
       (SELECT array_agg(asset ORDER BY asset) FROM asset_status WHERE decimals IS NULL OR decimals < 0 OR decimals > 36) AS missing_assets,
       (SELECT count(*) FROM token_candles WHERE chain_id = $1 AND ($2::text IS NULL OR pair_address = $2) AND ($3::timestamptz IS NULL OR bucket_start >= $3) AND ($4::timestamptz IS NULL OR bucket_start <= $4))::text AS token_candle_count`,
    [chainId, pairAddress ?? null, from ?? null, to ?? null],
  );
  const stats = diagnostics.rows[0];
  if (stats) {
    console.log(`candle diagnostics swaps=${stats.swap_count} eligible_swaps=${stats.eligible_swap_count} token_candles=${stats.token_candle_count}`);
    if (stats.missing_assets?.length) console.log(`candle diagnostics missing_or_invalid_decimals=${stats.missing_assets.join(",")}`);
  }
} finally {
  client.release();
  await pool.end();
}
