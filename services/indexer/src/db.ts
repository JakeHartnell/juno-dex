import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import type { IndexerConfig } from "./config.js";
import type { IncentiveEvent, LiquidityEvent, NormalizedEvent, PoolCreatedEvent, SwapEvent } from "./events.js";

const { Pool } = pg;
export type PgPool = InstanceType<typeof Pool>;
export type PgClient = pg.PoolClient;

export function createPool(config: IndexerConfig): PgPool {
  return new Pool({ connectionString: config.databaseUrl, max: 5 });
}

export async function runMigrations(pool: PgPool, migrationsDir = new URL("../migrations", import.meta.url).pathname): Promise<string[]> {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const file of files) {
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
  await client.query(
    `INSERT INTO processed_blocks(chain_id, height, block_hash, parent_hash, block_time, tx_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (height) DO UPDATE
     SET chain_id = EXCLUDED.chain_id,
         block_hash = EXCLUDED.block_hash,
         parent_hash = EXCLUDED.parent_hash,
         block_time = EXCLUDED.block_time,
         tx_count = EXCLUDED.tx_count,
         processed_at = now()`,
    [params.chainId, params.height, params.blockHash, params.parentHash ?? null, params.blockTime, params.txCount],
  );
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

async function insertSwap(client: PgClient, chainId: string, event: SwapEvent): Promise<void> {
  await client.query(
    `INSERT INTO swaps(chain_id, pair_address, height, block_time, tx_hash, msg_index, event_index, trader,
       offer_asset, offer_amount, ask_asset, return_amount, spread_amount, commission_amount, raw_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
     ON CONFLICT DO NOTHING`,
    [
      chainId,
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
}

async function insertLiquidityEvent(client: PgClient, chainId: string, event: LiquidityEvent): Promise<void> {
  await client.query(
    `INSERT INTO liquidity_events(chain_id, pair_address, height, block_time, tx_hash, msg_index, event_index, kind, provider, assets, share_amount, raw_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb)
     ON CONFLICT DO NOTHING`,
    [chainId, event.pairAddress, event.height, event.blockTime, event.txHash, event.msgIndex, event.eventIndex, event.kind, event.provider ?? null, JSON.stringify(event.assets), event.shareAmount ?? null, JSON.stringify(event.raw)],
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
