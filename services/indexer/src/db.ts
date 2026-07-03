import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { aggregateSwapsToCandles, bucketStartFor, deriveCanonicalSwapPrice, SUPPORTED_CANDLE_INTERVALS } from "./candles.js";
import type { IndexerConfig } from "./config.js";
import type { IncentiveEvent, LiquidityEvent, NormalizedEvent, PoolCreatedEvent, SwapEvent } from "./events.js";

const { Pool } = pg;
export type PgPool = InstanceType<typeof Pool>;
export type PgClient = pg.PoolClient;

export function createPool(config: IndexerConfig): PgPool {
  return new Pool({ connectionString: config.databaseUrl, max: 5 });
}

const DEFAULT_MIGRATIONS_DIR = join(process.cwd(), "migrations");

export async function listMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  return (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
}

export async function runMigrations(pool: PgPool, migrationsDir = DEFAULT_MIGRATIONS_DIR): Promise<string[]> {
  const files = await listMigrationFiles(migrationsDir);
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const existing = await pool.query<{ version: string }>("SELECT version FROM schema_migrations");
  const alreadyApplied = new Set(existing.rows.map((row) => row.version));
  const applied: string[] = [];
  for (const file of files) {
    if (alreadyApplied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING", [file]);
      await pool.query("COMMIT");
      applied.push(file);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
  return applied;
}

export async function getCursor(client: PgClient, cursorId: string, chainId: string, startHeight: number): Promise<number> {
  const result = await client.query<{ last_height: string }>(
    `INSERT INTO indexer_cursors(id, chain_id, last_height)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET updated_at = now()
     RETURNING last_height`,
    [cursorId, chainId, Math.max(0, startHeight - 1)],
  );
  return Number(result.rows[0]?.last_height ?? Math.max(0, startHeight - 1));
}

export async function recordProcessedBlock(
  client: PgClient,
  params: { chainId: string; height: number; blockHash: string; parentHash?: string; blockTime: string; txCount: number },
): Promise<void> {
  const existing = await client.query<{ block_hash: string; parent_hash: string | null }>(
    `SELECT block_hash, parent_hash FROM processed_blocks WHERE chain_id = $1 AND height = $2`,
    [params.chainId, params.height],
  );
  const existingBlock = existing.rows[0];
  if (existingBlock && existingBlock.block_hash !== params.blockHash) {
    throw new Error(`processed block hash mismatch at height ${params.height}: existing=${existingBlock.block_hash} incoming=${params.blockHash}`);
  }

  if (params.parentHash) {
    const previous = await client.query<{ block_hash: string }>(
      `SELECT block_hash FROM processed_blocks WHERE chain_id = $1 AND height = $2 - 1`,
      [params.chainId, params.height],
    );
    const previousHash = previous.rows[0]?.block_hash;
    if (previousHash && previousHash !== params.parentHash) {
      throw new Error(`processed block parent hash mismatch at height ${params.height}: previous=${previousHash} incoming_parent=${params.parentHash}`);
    }
  }

  const written = await client.query(
    `INSERT INTO processed_blocks(chain_id, height, block_hash, parent_hash, block_time, tx_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (height) DO UPDATE
     SET chain_id = EXCLUDED.chain_id,
         block_time = EXCLUDED.block_time,
         tx_count = EXCLUDED.tx_count,
         processed_at = now(),
         parent_hash = COALESCE(processed_blocks.parent_hash, EXCLUDED.parent_hash)
     WHERE processed_blocks.chain_id = EXCLUDED.chain_id
       AND processed_blocks.block_hash = EXCLUDED.block_hash
       AND (
         processed_blocks.parent_hash IS NULL
         OR EXCLUDED.parent_hash IS NULL
         OR processed_blocks.parent_hash = EXCLUDED.parent_hash
       )`,
    [params.chainId, params.height, params.blockHash, params.parentHash ?? null, params.blockTime, params.txCount],
  );
  if (written.rowCount === 0) {
    throw new Error(`processed block conflict at height ${params.height}: existing row differs from incoming block`);
  }
}

export async function advanceCursor(
  client: PgClient,
  params: { cursorId: string; height: number; blockHash: string },
): Promise<void> {
  await client.query(
    `UPDATE indexer_cursors SET last_height = $2, last_block_hash = $3, updated_at = now() WHERE id = $1`,
    [params.cursorId, params.height, params.blockHash],
  );
}

export async function upsertPoolStateSnapshot(
  client: PgClient,
  params: { chainId: string; pairAddress: string; height: number; blockTime: string; reserves: unknown[]; totalShare?: string | null; source?: string },
): Promise<void> {
  const pool = await client.query<{ id: string }>(`SELECT id FROM pools WHERE chain_id = $1 AND pair_address = $2`, [params.chainId, params.pairAddress]);
  const poolId = pool.rows[0]?.id;
  if (!poolId) throw new Error(`cannot write pool state snapshot for unknown pair ${params.pairAddress}`);
  await client.query(
    `INSERT INTO pool_state_snapshots(pool_id, height, block_time, reserves, total_share, source)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (pool_id, height, source) DO UPDATE
     SET block_time = EXCLUDED.block_time,
         reserves = EXCLUDED.reserves,
         total_share = EXCLUDED.total_share`,
    [poolId, params.height, params.blockTime, JSON.stringify(params.reserves), params.totalShare ?? null, params.source ?? "event"],
  );
}

export async function writeNormalizedEvents(client: PgClient, chainId: string, events: NormalizedEvent[]): Promise<void> {
  for (const event of events) {
    if (event.kind === "pool_created") await upsertPool(client, chainId, event);
  }
  for (const event of events) {
    if (event.kind !== "pool_created") await writeNormalizedEvent(client, chainId, event);
  }
}

export async function writeNormalizedEvent(client: PgClient, chainId: string, event: NormalizedEvent): Promise<void> {
  switch (event.kind) {
    case "pool_created":
      return upsertPool(client, chainId, event);
    case "swap":
      return insertSwap(client, chainId, event);
    case "provide":
    case "withdraw":
      return insertLiquidityEvent(client, chainId, event);
    case "incentive":
      return insertIncentiveEvent(client, chainId, event);
  }
}

async function upsertPool(client: PgClient, chainId: string, event: PoolCreatedEvent): Promise<void> {
  await client.query(
    `INSERT INTO pools(chain_id, pair_address, factory_address, liquidity_token_address, pool_type, asset_infos, created_height, created_tx_hash, first_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     ON CONFLICT (chain_id, pair_address) DO UPDATE
     SET liquidity_token_address = COALESCE(EXCLUDED.liquidity_token_address, pools.liquidity_token_address),
         pool_type = COALESCE(EXCLUDED.pool_type, pools.pool_type),
         asset_infos = CASE WHEN jsonb_array_length(EXCLUDED.asset_infos) > 0 THEN EXCLUDED.asset_infos ELSE pools.asset_infos END,
         updated_at = now()`,
    [chainId, event.pairAddress, event.factoryAddress, event.liquidityTokenAddress ?? null, event.poolType ?? null, JSON.stringify(event.assetInfos), event.height, event.txHash, event.blockTime],
  );
}

async function poolIdForPair(client: PgClient, chainId: string, pairAddress: string): Promise<string | null> {
  const pool = await client.query<{ id: string }>(`SELECT id FROM pools WHERE chain_id = $1 AND pair_address = $2`, [chainId, pairAddress]);
  return pool.rows[0]?.id ?? null;
}

async function insertSwap(client: PgClient, chainId: string, event: SwapEvent): Promise<void> {
  const poolId = await poolIdForPair(client, chainId, event.pairAddress);
  if (!poolId) return;
  const inserted = await client.query<{ id: string; pool_id: string | null }>(
    `INSERT INTO swaps(chain_id, pool_id, pair_address, height, block_time, tx_hash, msg_index, event_index, trader,
       offer_asset, offer_amount, ask_asset, return_amount, spread_amount, commission_amount, raw_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id, pool_id`,
    [
      chainId,
      poolId,
      event.pairAddress,
      event.height,
      event.blockTime,
      event.txHash,
      event.msgIndex,
      event.eventIndex,
      event.trader ?? null,
      event.offerAsset ?? null,
      event.offerAmount ?? null,
      event.askAsset ?? null,
      event.returnAmount ?? null,
      event.spreadAmount ?? null,
      event.commissionAmount ?? null,
      JSON.stringify(event.raw),
    ],
  );
  if (inserted.rowCount === 0) return;
  await upsertCandlesForSwap(client, chainId, event, poolId);
}

const MAX_ASSET_DECIMALS = 36;
const assetDecimalsCache = new Map<string, number>();

function decimalsCacheKey(chainId: string, asset: string) {
  return `${chainId}:${asset}`;
}

function isValidAssetDecimals(value: unknown): value is number | string {
  if (value === null || value === undefined || value === "") return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_ASSET_DECIMALS;
}

function hasCompleteDecimals(decimals: Record<string, number>, assets: Array<string | undefined>): boolean {
  return assets.every((asset) => Boolean(asset) && decimals[asset!] !== undefined);
}

async function loadAssetDecimals(client: PgClient, chainId: string, assets: Array<string | undefined>): Promise<Record<string, number>> {
  const uniqueAssets = [...new Set(assets.filter((asset): asset is string => Boolean(asset)))];
  if (uniqueAssets.length === 0) return {};
  const decimals: Record<string, number> = {};
  const missing: string[] = [];
  for (const asset of uniqueAssets) {
    const cached = assetDecimalsCache.get(decimalsCacheKey(chainId, asset));
    if (cached === undefined) missing.push(asset);
    else decimals[asset] = cached;
  }
  if (missing.length > 0) {
    const result = await client.query<{ asset: string; decimals: number | string | null }>(
      `SELECT asset, decimals FROM asset_metadata WHERE chain_id = $1 AND asset = ANY($2::text[])`,
      [chainId, missing],
    );
    for (const row of result.rows) {
      if (!row.asset || !isValidAssetDecimals(row.decimals)) continue;
      const parsed = Number(row.decimals);
      assetDecimalsCache.set(decimalsCacheKey(chainId, row.asset), parsed);
      decimals[row.asset] = parsed;
    }
  }
  return decimals;
}

async function upsertCandlesForSwap(client: PgClient, chainId: string, event: SwapEvent, poolId: string): Promise<void> {
  const decimals = await loadAssetDecimals(client, chainId, [event.offerAsset, event.askAsset]);
  if (!hasCompleteDecimals(decimals, [event.offerAsset, event.askAsset])) return;
  const derived = deriveCanonicalSwapPrice({
    pairAddress: event.pairAddress,
    blockTime: event.blockTime,
    offerAsset: event.offerAsset,
    offerAmount: event.offerAmount,
    askAsset: event.askAsset,
    returnAmount: event.returnAmount,
  }, decimals);
  if (!derived) return;
  for (const interval of SUPPORTED_CANDLE_INTERVALS) {
    await client.query(
      `INSERT INTO token_candles(chain_id, pool_id, pair_address, asset, quote_asset, interval, bucket_start, open, high, low, close, volume, volume_quote, volume_usd, trade_count, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$8,$8,$9,$10,NULL,1,'indexer')
       ON CONFLICT (chain_id, pair_address, asset, quote_asset, interval, bucket_start) DO UPDATE
       SET high = GREATEST(token_candles.high, EXCLUDED.high),
           low = LEAST(token_candles.low, EXCLUDED.low),
           close = EXCLUDED.close,
           volume = token_candles.volume + EXCLUDED.volume,
           volume_quote = COALESCE(token_candles.volume_quote, 0) + COALESCE(EXCLUDED.volume_quote, 0),
           volume_usd = NULL,
           trade_count = token_candles.trade_count + 1,
           pool_id = COALESCE(token_candles.pool_id, EXCLUDED.pool_id),
           updated_at = now()`,
      [chainId, poolId, event.pairAddress, derived.baseAsset, derived.quoteAsset, interval, bucketStartFor(event.blockTime, interval), derived.price, derived.volume, derived.volumeQuote],
    );
  }
}

export async function backfillTokenCandles(
  client: PgClient,
  params: { chainId: string; pairAddress?: string; from?: string; to?: string; batchSize?: number } = { chainId: "juno-1" },
): Promise<number> {
  type SwapBackfillRow = { pair_address: string; block_time: string; offer_asset?: string; offer_amount?: string; ask_asset?: string; return_amount?: string; height: string; tx_hash: string; msg_index: string; event_index: string };
  const result = await client.query<SwapBackfillRow>(
    `SELECT pair_address, block_time, offer_asset, offer_amount, ask_asset, return_amount,
            $1::text AS chain_id, height, tx_hash, msg_index, event_index
     FROM swaps
     WHERE chain_id = $1
       AND ($2::text IS NULL OR pair_address = $2)
       AND ($3::timestamptz IS NULL OR block_time >= $3)
       AND ($4::timestamptz IS NULL OR block_time <= $4)
     ORDER BY height ASC, id ASC
     LIMIT $5`,
    [params.chainId, params.pairAddress ?? null, params.from ?? null, params.to ?? null, params.batchSize ?? 10_000],
  );
  const swaps = result.rows.map((row) => ({
    pairAddress: row.pair_address,
    blockTime: row.block_time,
    offerAsset: row.offer_asset,
    offerAmount: row.offer_amount,
    askAsset: row.ask_asset,
    returnAmount: row.return_amount,
  }));
  const poolIds = new Map<string, string | null>();
  for (const row of result.rows) {
    if (poolIds.has(row.pair_address)) continue;
    const pool = await client.query<{ id: string }>(`SELECT id FROM pools WHERE chain_id = $1 AND pair_address = $2`, [params.chainId, row.pair_address]);
    poolIds.set(row.pair_address, pool.rows[0]?.id ?? null);
  }
  const decimals = await loadAssetDecimals(client, params.chainId, swaps.flatMap((swap) => [swap.offerAsset, swap.askAsset]));
  const swapsWithDecimals = swaps.filter((swap) => hasCompleteDecimals(decimals, [swap.offerAsset, swap.askAsset]));
  for (const interval of SUPPORTED_CANDLE_INTERVALS) {
    const candles = aggregateSwapsToCandles(swapsWithDecimals, interval, decimals);
    for (const candle of candles) {
      await client.query(
        `INSERT INTO token_candles(chain_id, pool_id, pair_address, asset, quote_asset, interval, bucket_start, open, high, low, close, volume, volume_quote, volume_usd, trade_count, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,'backfill')
         ON CONFLICT (chain_id, pair_address, asset, quote_asset, interval, bucket_start) DO UPDATE
         SET open = EXCLUDED.open,
             high = EXCLUDED.high,
             low = EXCLUDED.low,
             close = EXCLUDED.close,
             volume = EXCLUDED.volume,
             volume_quote = EXCLUDED.volume_quote,
             volume_usd = NULL,
             trade_count = EXCLUDED.trade_count,
             pool_id = COALESCE(token_candles.pool_id, EXCLUDED.pool_id),
             source = 'backfill',
             updated_at = now()`,
        [params.chainId, poolIds.get(candle.pairAddress) ?? null, candle.pairAddress, candle.baseAsset, candle.quoteAsset, interval, candle.bucketStart, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.volumeQuote, candle.tradeCount],
      );
    }
  }
  return result.rowCount ?? 0;
}

async function insertLiquidityEvent(client: PgClient, chainId: string, event: LiquidityEvent): Promise<void> {
  const poolId = await poolIdForPair(client, chainId, event.pairAddress);
  if (!poolId) return;
  await client.query(
    `INSERT INTO liquidity_events(chain_id, pool_id, pair_address, height, block_time, tx_hash, msg_index, event_index, kind, provider, assets, share_amount, raw_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb)
     ON CONFLICT DO NOTHING`,
    [chainId, poolId, event.pairAddress, event.height, event.blockTime, event.txHash, event.msgIndex, event.eventIndex, event.kind, event.provider ?? null, JSON.stringify(event.assets), event.shareAmount ?? null, JSON.stringify(event.raw)],
  );
}

async function insertIncentiveEvent(client: PgClient, chainId: string, event: IncentiveEvent): Promise<void> {
  await client.query(
    `INSERT INTO incentive_events(chain_id, incentives_address, lp_token_address, user_address, action, amount, reward_asset, reward_amount,
       height, block_time, tx_hash, msg_index, event_index, raw_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     ON CONFLICT DO NOTHING`,
    [chainId, event.incentivesAddress, event.lpTokenAddress ?? null, event.userAddress ?? null, event.action, event.amount ?? null, event.rewardAsset ?? null, event.rewardAmount ?? null, event.height, event.blockTime, event.txHash, event.msgIndex, event.eventIndex, JSON.stringify(event.raw)],
  );
}
