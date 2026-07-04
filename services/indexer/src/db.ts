import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { aggregateSwapsToCandles, bucketStartFor, deriveCanonicalSwapPrice, SUPPORTED_CANDLE_INTERVALS } from "./candles.js";
import type { IndexerConfig } from "./config.js";
import type { IncentiveEvent, LiquidityEvent, NormalizedEvent, PoolCreatedEvent, SwapEvent } from "./events.js";

const { Pool } = pg;
export type PgPool = InstanceType<typeof Pool>;
export type PgClient = pg.PoolClient;

export type SnapshotJobStatus = "pending" | "leased" | "succeeded" | "failed";
export type SnapshotJob = {
  id: string;
  chainId: string;
  pairAddress: string;
  height: number;
  blockTime: string;
  reason: string;
  status: SnapshotJobStatus;
  attempts: number;
};

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

export async function enqueueSnapshotJobs(
  client: PgClient,
  params: { chainId: string; pairAddresses: string[]; height: number; blockTime: string; reason: string },
): Promise<number> {
  const pairAddresses = [...new Set(params.pairAddresses.filter(Boolean))];
  if (pairAddresses.length === 0) return 0;
  const result = await client.query(
    `INSERT INTO snapshot_jobs(chain_id, pair_address, height, block_time, reason)
     SELECT $1, p.pair_address, $3, $4, $5
     FROM pools p
     WHERE p.chain_id = $1
       AND p.pair_address = ANY($2::text[])
     ON CONFLICT (chain_id, pair_address, height, reason) DO NOTHING`,
    [params.chainId, pairAddresses, params.height, params.blockTime, params.reason],
  );
  return result.rowCount ?? 0;
}

export async function claimSnapshotJobs(
  client: PgClient,
  params: { chainId: string; limit: number; leaseSeconds: number; maxAttempts: number },
): Promise<SnapshotJob[]> {
  const result = await client.query<{
    id: string;
    chain_id: string;
    pair_address: string;
    height: string | number;
    block_time: string;
    reason: string;
    status: SnapshotJobStatus;
    attempts: string | number;
  }>(
    `WITH claimable AS (
       SELECT id
       FROM snapshot_jobs
       WHERE chain_id = $1
         AND status IN ('pending', 'leased')
         AND attempts < $4
         AND (status = 'pending' OR leased_until <= now() OR leased_until IS NULL)
       ORDER BY id ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     UPDATE snapshot_jobs j
     SET status = 'leased',
         attempts = j.attempts + 1,
         leased_until = now() + ($3::text)::interval,
         updated_at = now()
     FROM claimable
     WHERE j.id = claimable.id
     RETURNING j.id, j.chain_id, j.pair_address, j.height, j.block_time, j.reason, j.status, j.attempts`,
    [params.chainId, params.limit, `${params.leaseSeconds} seconds`, params.maxAttempts],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    chainId: row.chain_id,
    pairAddress: row.pair_address,
    height: Number(row.height),
    blockTime: row.block_time,
    reason: row.reason,
    status: row.status,
    attempts: Number(row.attempts),
  }));
}

export async function markSnapshotJobSucceeded(client: PgClient, params: { jobId: string; attempt: number }): Promise<void> {
  await client.query(
    `UPDATE snapshot_jobs
     SET status = 'succeeded', leased_until = NULL, last_error = NULL, updated_at = now()
     WHERE id = $1
       AND status = 'leased'
       AND attempts = $2`,
    [params.jobId, params.attempt],
  );
}

export async function markSnapshotJobFailed(
  client: PgClient,
  params: { jobId: string; attempt: number; error: string; permanent: boolean; maxAttempts: number },
): Promise<void> {
  await client.query(
    `UPDATE snapshot_jobs
     SET status = CASE WHEN $3::boolean OR attempts >= $5 THEN 'failed' ELSE 'pending' END,
         leased_until = NULL,
         last_error = $4,
         updated_at = now()
     WHERE id = $1
       AND status = 'leased'
       AND attempts = $2`,
    [params.jobId, params.attempt, params.permanent, params.error.slice(0, 2_000), params.maxAttempts],
  );
}

export type WriteNormalizedEventsOptions = {
  writeCandlesInline?: boolean;
};

export type StagedBlock = {
  chainId: string;
  height: number;
  blockHash: string;
  parentHash?: string;
  blockTime: string;
  txCount: number;
  events: NormalizedEvent[];
};

type MultiInsertColumn<T> = { name: string; value: (row: T) => unknown; cast?: string };

async function multiInsert<T>(client: PgClient, table: string, columns: MultiInsertColumn<T>[], rows: T[], conflict = "DO NOTHING"): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(column.value(row));
      return `$${values.length}${column.cast ? `::${column.cast}` : ""}`;
    });
    return `(${placeholders.join(",")})`;
  });
  await client.query(
    `INSERT INTO ${table}(${columns.map((column) => column.name).join(",")}) VALUES ${tuples.join(",")} ON CONFLICT ${conflict}`,
    values,
  );
}

export async function stageAndMergeBatch(
  client: PgClient,
  params: { batchId: string; chainId: string; cursorId: string; blocks: StagedBlock[]; writeCandlesInline?: boolean; enqueueSnapshots?: boolean; cleanupOlderThanHours?: number },
): Promise<void> {
  if (params.blocks.length === 0) return;
  const batchId = params.batchId;
  await stageProcessedBlocks(client, batchId, params.blocks);
  await stageEvents(client, batchId, params.chainId, params.blocks.flatMap((block) => block.events));
  await mergeStagedBatch(client, params);
}

async function stageProcessedBlocks(client: PgClient, batchId: string, blocks: StagedBlock[]): Promise<void> {
  await multiInsert(client, "stage_processed_blocks", [
    { name: "batch_id", value: () => batchId, cast: "uuid" },
    { name: "chain_id", value: (block) => block.chainId },
    { name: "height", value: (block) => block.height },
    { name: "block_hash", value: (block) => block.blockHash },
    { name: "parent_hash", value: (block) => block.parentHash ?? null },
    { name: "block_time", value: (block) => block.blockTime },
    { name: "tx_count", value: (block) => block.txCount },
  ], blocks);
}

async function stageEvents(client: PgClient, batchId: string, chainId: string, events: NormalizedEvent[]): Promise<void> {
  await multiInsert(client, "stage_pools", [
    { name: "batch_id", value: () => batchId, cast: "uuid" },
    { name: "chain_id", value: () => chainId },
    { name: "height", value: (event) => event.height },
    { name: "block_time", value: (event) => event.blockTime },
    { name: "tx_hash", value: (event) => event.txHash },
    { name: "msg_index", value: (event) => event.msgIndex },
    { name: "event_index", value: (event) => event.eventIndex },
    { name: "factory_address", value: (event) => event.factoryAddress },
    { name: "pair_address", value: (event) => event.pairAddress },
    { name: "liquidity_token_address", value: (event) => event.liquidityTokenAddress ?? null },
    { name: "pool_type", value: (event) => event.poolType ?? null },
    { name: "asset_infos", value: (event) => JSON.stringify(event.assetInfos), cast: "jsonb" },
    { name: "raw_event", value: (event) => JSON.stringify(event.raw), cast: "jsonb" },
  ], events.filter((event): event is PoolCreatedEvent => event.kind === "pool_created"));

  await multiInsert(client, "stage_swaps", [
    { name: "batch_id", value: () => batchId, cast: "uuid" },
    { name: "chain_id", value: () => chainId },
    { name: "height", value: (event) => event.height },
    { name: "block_time", value: (event) => event.blockTime },
    { name: "tx_hash", value: (event) => event.txHash },
    { name: "msg_index", value: (event) => event.msgIndex },
    { name: "event_index", value: (event) => event.eventIndex },
    { name: "pair_address", value: (event) => event.pairAddress },
    { name: "trader", value: (event) => event.trader ?? null },
    { name: "offer_asset", value: (event) => event.offerAsset ?? null },
    { name: "offer_amount", value: (event) => event.offerAmount ?? null },
    { name: "ask_asset", value: (event) => event.askAsset ?? null },
    { name: "return_amount", value: (event) => event.returnAmount ?? null },
    { name: "spread_amount", value: (event) => event.spreadAmount ?? null },
    { name: "commission_amount", value: (event) => event.commissionAmount ?? null },
    { name: "raw_event", value: (event) => JSON.stringify(event.raw), cast: "jsonb" },
  ], events.filter((event): event is SwapEvent => event.kind === "swap"));

  await multiInsert(client, "stage_liquidity_events", [
    { name: "batch_id", value: () => batchId, cast: "uuid" },
    { name: "chain_id", value: () => chainId },
    { name: "height", value: (event) => event.height },
    { name: "block_time", value: (event) => event.blockTime },
    { name: "tx_hash", value: (event) => event.txHash },
    { name: "msg_index", value: (event) => event.msgIndex },
    { name: "event_index", value: (event) => event.eventIndex },
    { name: "pair_address", value: (event) => event.pairAddress },
    { name: "kind", value: (event) => event.kind },
    { name: "provider", value: (event) => event.provider ?? null },
    { name: "assets", value: (event) => JSON.stringify(event.assets), cast: "jsonb" },
    { name: "share_amount", value: (event) => event.shareAmount ?? null },
    { name: "raw_event", value: (event) => JSON.stringify(event.raw), cast: "jsonb" },
  ], events.filter((event): event is LiquidityEvent => event.kind === "provide" || event.kind === "withdraw"));

  await multiInsert(client, "stage_incentive_events", [
    { name: "batch_id", value: () => batchId, cast: "uuid" },
    { name: "chain_id", value: () => chainId },
    { name: "height", value: (event) => event.height },
    { name: "block_time", value: (event) => event.blockTime },
    { name: "tx_hash", value: (event) => event.txHash },
    { name: "msg_index", value: (event) => event.msgIndex },
    { name: "event_index", value: (event) => event.eventIndex },
    { name: "incentives_address", value: (event) => event.incentivesAddress },
    { name: "lp_token_address", value: (event) => event.lpTokenAddress ?? null },
    { name: "user_address", value: (event) => event.userAddress ?? null },
    { name: "action", value: (event) => event.action },
    { name: "amount", value: (event) => event.amount ?? null },
    { name: "reward_asset", value: (event) => event.rewardAsset ?? null },
    { name: "reward_amount", value: (event) => event.rewardAmount ?? null },
    { name: "raw_event", value: (event) => JSON.stringify(event.raw), cast: "jsonb" },
  ], events.filter((event): event is IncentiveEvent => event.kind === "incentive"));
}

async function mergeStagedBatch(
  client: PgClient,
  params: { batchId: string; chainId: string; cursorId: string; blocks: StagedBlock[]; writeCandlesInline?: boolean; enqueueSnapshots?: boolean; cleanupOlderThanHours?: number },
): Promise<void> {
  const batchId = params.batchId;
  await validateStagedBlockContinuity(client, params.chainId, params.blocks);
  const blockResult = await client.query(
    `INSERT INTO processed_blocks(chain_id, height, block_hash, parent_hash, block_time, tx_count)
     SELECT chain_id, height, block_hash, parent_hash, block_time, tx_count
     FROM stage_processed_blocks
     WHERE batch_id = $1::uuid AND chain_id = $2
     ORDER BY height ASC
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
    [batchId, params.chainId],
  );
  if ((blockResult.rowCount ?? 0) !== params.blocks.length) throw new Error(`processed block conflict while merging staging batch ${batchId}`);

  await client.query(
    `INSERT INTO pools(chain_id, pair_address, factory_address, liquidity_token_address, pool_type, asset_infos, created_height, created_tx_hash, first_seen_at)
     SELECT chain_id, pair_address, factory_address, liquidity_token_address, pool_type, asset_infos, height, tx_hash, block_time
     FROM stage_pools
     WHERE batch_id = $1::uuid AND chain_id = $2
     ORDER BY height ASC, msg_index ASC, event_index ASC
     ON CONFLICT (chain_id, pair_address) DO UPDATE
     SET liquidity_token_address = COALESCE(EXCLUDED.liquidity_token_address, pools.liquidity_token_address),
         pool_type = COALESCE(EXCLUDED.pool_type, pools.pool_type),
         asset_infos = CASE WHEN jsonb_array_length(EXCLUDED.asset_infos) > 0 THEN EXCLUDED.asset_infos ELSE pools.asset_infos END,
         updated_at = now()`,
    [batchId, params.chainId],
  );

  await client.query(
    `INSERT INTO swaps(chain_id, pool_id, pair_address, height, block_time, tx_hash, msg_index, event_index, trader,
       offer_asset, offer_amount, ask_asset, return_amount, spread_amount, commission_amount, raw_event)
     SELECT s.chain_id, p.id, s.pair_address, s.height, s.block_time, s.tx_hash, s.msg_index, s.event_index, s.trader,
       s.offer_asset, s.offer_amount, s.ask_asset, s.return_amount, s.spread_amount, s.commission_amount, s.raw_event
     FROM stage_swaps s
     JOIN pools p ON p.chain_id = s.chain_id AND p.pair_address = s.pair_address
     WHERE s.batch_id = $1::uuid AND s.chain_id = $2
     ORDER BY s.height ASC, s.msg_index ASC, s.event_index ASC
     ON CONFLICT DO NOTHING`,
    [batchId, params.chainId],
  );

  await client.query(
    `INSERT INTO liquidity_events(chain_id, pool_id, pair_address, height, block_time, tx_hash, msg_index, event_index, kind, provider, assets, share_amount, raw_event)
     SELECT s.chain_id, p.id, s.pair_address, s.height, s.block_time, s.tx_hash, s.msg_index, s.event_index, s.kind, s.provider, s.assets, s.share_amount, s.raw_event
     FROM stage_liquidity_events s
     JOIN pools p ON p.chain_id = s.chain_id AND p.pair_address = s.pair_address
     WHERE s.batch_id = $1::uuid AND s.chain_id = $2
     ORDER BY s.height ASC, s.msg_index ASC, s.event_index ASC
     ON CONFLICT DO NOTHING`,
    [batchId, params.chainId],
  );

  await client.query(
    `INSERT INTO incentive_events(chain_id, incentives_address, lp_token_address, user_address, action, amount, reward_asset, reward_amount,
       height, block_time, tx_hash, msg_index, event_index, raw_event)
     SELECT chain_id, incentives_address, lp_token_address, user_address, action, amount, reward_asset, reward_amount,
       height, block_time, tx_hash, msg_index, event_index, raw_event
     FROM stage_incentive_events
     WHERE batch_id = $1::uuid AND chain_id = $2
     ORDER BY height ASC, msg_index ASC, event_index ASC
     ON CONFLICT DO NOTHING`,
    [batchId, params.chainId],
  );

  if (params.writeCandlesInline === false) {
    await client.query(
      `INSERT INTO candle_jobs(chain_id, pair_address, from_time, to_time, status, run_after)
       SELECT DISTINCT s.chain_id, s.pair_address,
              date_trunc('day', s.block_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS from_time,
              (date_trunc('day', s.block_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') + interval '1 day' AS to_time,
              'pending', now()
       FROM stage_swaps s
       JOIN pools p ON p.chain_id = s.chain_id AND p.pair_address = s.pair_address
       WHERE s.batch_id = $1::uuid AND s.chain_id = $2
       ON CONFLICT (chain_id, pair_address, from_time, to_time) DO UPDATE
       SET status = CASE WHEN candle_jobs.status = 'running' THEN candle_jobs.status ELSE 'pending' END,
           rerun_requested = CASE WHEN candle_jobs.status = 'running' THEN true ELSE false END,
           run_after = now(),
           last_error = NULL,
           updated_at = now()`,
      [batchId, params.chainId],
    );
  }

  if (params.enqueueSnapshots) {
    await client.query(
      `INSERT INTO snapshot_jobs(chain_id, pair_address, height, block_time, reason)
       SELECT DISTINCT s.chain_id, s.pair_address, s.height, s.block_time, 'touched'
       FROM (
         SELECT chain_id, pair_address, height, block_time FROM stage_swaps WHERE batch_id = $1::uuid AND chain_id = $2
         UNION
         SELECT chain_id, pair_address, height, block_time FROM stage_liquidity_events WHERE batch_id = $1::uuid AND chain_id = $2
       ) s
       JOIN pools p ON p.chain_id = s.chain_id AND p.pair_address = s.pair_address
       ON CONFLICT (chain_id, pair_address, height, reason) DO NOTHING`,
      [batchId, params.chainId],
    );
  }

  const lastBlock = params.blocks[params.blocks.length - 1];
  await advanceCursor(client, { cursorId: params.cursorId, height: lastBlock.height, blockHash: lastBlock.blockHash });
  await client.query(`UPDATE stage_processed_blocks SET merged_at = now() WHERE batch_id = $1::uuid AND chain_id = $2`, [batchId, params.chainId]);
  await cleanupSuccessfulStagingBatches(client, { chainId: params.chainId, olderThanHours: params.cleanupOlderThanHours ?? 24 });
}

async function validateStagedBlockContinuity(client: PgClient, chainId: string, blocks: StagedBlock[]): Promise<void> {
  const ordered = [...blocks].sort((a, b) => a.height - b.height);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (current.height !== previous.height + 1) throw new Error(`non-contiguous staging batch at height ${current.height}`);
    if (current.parentHash && current.parentHash !== previous.blockHash) {
      throw new Error(`parent hash mismatch for staged block ${current.height}`);
    }
  }

  const first = ordered[0];
  if (!first?.parentHash) return;
  const result = await client.query<{ block_hash: string }>(
    `SELECT block_hash FROM processed_blocks WHERE chain_id = $1 AND height = $2`,
    [chainId, first.height - 1],
  );
  const previous = result.rows[0];
  if (previous && previous.block_hash !== first.parentHash) {
    throw new Error(`parent hash mismatch for staged block ${first.height}`);
  }
}

export async function cleanupSuccessfulStagingBatches(client: PgClient, params: { chainId: string; olderThanHours?: number }): Promise<void> {
  const olderThan = `${params.olderThanHours ?? 24} hours`;
  await client.query(
    `WITH old_batches AS (
       SELECT DISTINCT batch_id FROM stage_processed_blocks
       WHERE chain_id = $1 AND merged_at IS NOT NULL AND merged_at < now() - ($2::text)::interval
     )
     DELETE FROM stage_pools WHERE batch_id IN (SELECT batch_id FROM old_batches)`,
    [params.chainId, olderThan],
  );
  await client.query(`DELETE FROM stage_swaps WHERE batch_id IN (SELECT batch_id FROM stage_processed_blocks WHERE chain_id = $1 AND merged_at IS NOT NULL AND merged_at < now() - ($2::text)::interval)`, [params.chainId, olderThan]);
  await client.query(`DELETE FROM stage_liquidity_events WHERE batch_id IN (SELECT batch_id FROM stage_processed_blocks WHERE chain_id = $1 AND merged_at IS NOT NULL AND merged_at < now() - ($2::text)::interval)`, [params.chainId, olderThan]);
  await client.query(`DELETE FROM stage_incentive_events WHERE batch_id IN (SELECT batch_id FROM stage_processed_blocks WHERE chain_id = $1 AND merged_at IS NOT NULL AND merged_at < now() - ($2::text)::interval)`, [params.chainId, olderThan]);
  await client.query(`DELETE FROM stage_processed_blocks WHERE chain_id = $1 AND merged_at IS NOT NULL AND merged_at < now() - ($2::text)::interval`, [params.chainId, olderThan]);
}

export async function writeNormalizedEvents(client: PgClient, chainId: string, events: NormalizedEvent[], options: WriteNormalizedEventsOptions = {}): Promise<void> {
  for (const event of events) {
    if (event.kind === "pool_created") await upsertPool(client, chainId, event);
  }
  for (const event of events) {
    if (event.kind !== "pool_created") await writeNormalizedEvent(client, chainId, event, options);
  }
}

export async function writeNormalizedEvent(client: PgClient, chainId: string, event: NormalizedEvent, options: WriteNormalizedEventsOptions = {}): Promise<void> {
  switch (event.kind) {
    case "pool_created":
      return upsertPool(client, chainId, event);
    case "swap":
      return insertSwap(client, chainId, event, options);
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

async function insertSwap(client: PgClient, chainId: string, event: SwapEvent, options: WriteNormalizedEventsOptions): Promise<void> {
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
  if (options.writeCandlesInline === false) {
    await enqueueCandleJobForSwap(client, chainId, event.pairAddress, event.blockTime);
  } else {
    await upsertCandlesForSwap(client, chainId, event, poolId);
  }
}

function addMilliseconds(iso: string, ms: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid candle job timestamp: ${iso}`);
  return new Date(date.getTime() + ms).toISOString();
}

export async function enqueueCandleJobForSwap(client: PgClient, chainId: string, pairAddress: string, blockTime: string): Promise<void> {
  const fromTime = bucketStartFor(blockTime, "1d");
  const toTime = addMilliseconds(fromTime, 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO candle_jobs(chain_id, pair_address, from_time, to_time, status, run_after)
     VALUES ($1, $2, $3, $4, 'pending', now())
     ON CONFLICT (chain_id, pair_address, from_time, to_time) DO UPDATE
     SET status = CASE WHEN candle_jobs.status = 'running' THEN candle_jobs.status ELSE 'pending' END,
         rerun_requested = CASE WHEN candle_jobs.status = 'running' THEN true ELSE false END,
         run_after = now(),
         last_error = NULL,
         updated_at = now()`,
    [chainId, pairAddress, fromTime, toTime],
  );
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
  return rebuildTokenCandlesForRange(client, { ...params, source: "backfill", toExclusive: false });
}

export async function rebuildTokenCandlesForRange(
  client: PgClient,
  params: { chainId: string; pairAddress?: string; from?: string; to?: string; batchSize?: number; source?: string; toExclusive?: boolean } = { chainId: "juno-1" },
): Promise<number> {
  type SwapBackfillRow = { pair_address: string; block_time: string; offer_asset?: string; offer_amount?: string; ask_asset?: string; return_amount?: string; height: string; tx_hash: string; msg_index: string; event_index: string };
  const result = await client.query<SwapBackfillRow>(
    `SELECT pair_address, block_time, offer_asset, offer_amount, ask_asset, return_amount,
            $1::text AS chain_id, height, tx_hash, msg_index, event_index
     FROM swaps
     WHERE chain_id = $1
       AND ($2::text IS NULL OR pair_address = $2)
       AND ($3::timestamptz IS NULL OR block_time >= $3)
       AND ($4::timestamptz IS NULL OR (($6::boolean AND block_time < $4) OR (NOT $6::boolean AND block_time <= $4)))
     ORDER BY height ASC, msg_index ASC, event_index ASC, id ASC
     LIMIT $5`,
    [params.chainId, params.pairAddress ?? null, params.from ?? null, params.to ?? null, params.batchSize ?? 10_000, params.toExclusive ?? false],
  );
  const swaps: Array<{ pairAddress: string; blockTime: string; offerAsset?: string; offerAmount?: string; askAsset?: string; returnAmount?: string }> = result.rows.map((row: SwapBackfillRow) => ({
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,$15)
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
             source = EXCLUDED.source,
             updated_at = now()`,
        [params.chainId, poolIds.get(candle.pairAddress) ?? null, candle.pairAddress, candle.baseAsset, candle.quoteAsset, interval, candle.bucketStart, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.volumeQuote, candle.tradeCount, params.source ?? "backfill"],
      );
    }
  }
  return result.rowCount ?? 0;
}

export type CandleJob = {
  id: string;
  chainId: string;
  pairAddress: string;
  fromTime: string;
  toTime: string;
  attempts: number;
  workerId: string;
};

type CandleJobRow = { id: string; chain_id: string; pair_address: string; from_time: string; to_time: string; attempts: number | string; worker_id: string };

function mapCandleJob(row: CandleJobRow): CandleJob {
  return {
    id: String(row.id),
    chainId: row.chain_id,
    pairAddress: row.pair_address,
    fromTime: row.from_time,
    toTime: row.to_time,
    attempts: Number(row.attempts),
    workerId: row.worker_id,
  };
}

export async function claimNextCandleJob(client: PgClient, params: { chainId: string; workerId: string; staleAfterMs?: number }): Promise<CandleJob | undefined> {
  const result = await client.query<CandleJobRow>(
    `WITH next_job AS (
       SELECT id
       FROM candle_jobs
       WHERE chain_id = $1
         AND run_after <= now()
         AND (
           status IN ('pending', 'failed')
           OR (status = 'running' AND claimed_at < now() - (($3::text)::interval))
         )
       ORDER BY run_after ASC, created_at ASC, id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE candle_jobs
     SET status = 'running',
         attempts = attempts + 1,
         worker_id = $2,
         claimed_at = now(),
         last_error = NULL,
         updated_at = now()
     FROM next_job
     WHERE candle_jobs.id = next_job.id
     RETURNING candle_jobs.id, chain_id, pair_address, from_time, to_time, attempts, worker_id`,
    [params.chainId, params.workerId, `${params.staleAfterMs ?? 10 * 60 * 1000} milliseconds`],
  );
  const row = result.rows[0];
  return row ? mapCandleJob(row) : undefined;
}

export async function completeCandleJob(client: PgClient, job: CandleJob, processedSwaps: number): Promise<void> {
  await client.query(
    `UPDATE candle_jobs
     SET status = CASE WHEN rerun_requested THEN 'pending' ELSE 'completed' END,
         rerun_requested = false,
         processed_swaps = $4,
         updated_at = now()
     WHERE id = $1
       AND status = 'running'
       AND worker_id = $2
       AND attempts = $3`,
    [job.id, job.workerId, job.attempts, processedSwaps],
  );
}

export async function failCandleJob(client: PgClient, job: CandleJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await client.query(
    `UPDATE candle_jobs
     SET status = 'failed', last_error = $4, run_after = now() + (($5::text)::interval), updated_at = now()
     WHERE id = $1
       AND status = 'running'
       AND worker_id = $2
       AND attempts = $3`,
    [job.id, job.workerId, job.attempts, message.slice(0, 2_000), "30 seconds"],
  );
}

export async function processNextCandleJob(client: PgClient, params: { chainId: string; workerId: string; batchSize?: number; staleAfterMs?: number }): Promise<CandleJob | undefined> {
  const job = await claimNextCandleJob(client, params);
  if (!job) return undefined;
  try {
    const processed = await rebuildTokenCandlesForRange(client, {
      chainId: job.chainId,
      pairAddress: job.pairAddress,
      from: job.fromTime,
      to: job.toTime,
      batchSize: params.batchSize ?? 2_147_483_647,
      source: "worker",
      toExclusive: true,
    });
    await completeCandleJob(client, job, processed);
    return job;
  } catch (error) {
    await failCandleJob(client, job, error);
    throw error;
  }
}

export async function refreshApiReadModels(client: PgClient, params: { chainId?: string } = {}): Promise<Array<{ model: string; rowsAffected: number }>> {
  const result = await client.query<{ model: string; rows_affected: string | number }>(
    `SELECT model, rows_affected FROM refresh_api_read_models($1::text)`,
    [params.chainId ?? null],
  );
  return result.rows.map((row) => ({ model: row.model, rowsAffected: Number(row.rows_affected) }));
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
