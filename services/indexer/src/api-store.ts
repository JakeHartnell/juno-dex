import type { PgPool } from "./db.js";
import { JunoRpcClient } from "./rpc.js";
import type { IndexerApiStore, PaginationQuery } from "./api.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CANDLE_LIMIT = 500;
const CANDLE_INTERVALS = new Set(["5m", "1h", "1d"]);

type Queryable = Pick<PgPool, "query">;
type StoreOptions = { rpcUrl?: string; expectedMigrationCount?: number };

function limit(query: PaginationQuery, max = MAX_LIMIT): number {
  const parsed = Number.parseInt(query.limit ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, max);
}

function offset(query: PaginationQuery): number {
  const parsed = Number.parseInt(query.cursor ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function page<T>(rows: T[], query: PaginationQuery, max = MAX_LIMIT) {
  const safeLimit = limit(query, max);
  const start = offset(query);
  return { data: rows, pagination: { limit: safeLimit, nextCursor: rows.length === safeLimit ? String(start + safeLimit) : null } };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function normalizeAssetInfo(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.native_token === "object" && obj.native_token) return String((obj.native_token as Record<string, unknown>).denom ?? "");
    if (typeof obj.token === "object" && obj.token) return String((obj.token as Record<string, unknown>).contract_addr ?? "");
  }
  return String(value ?? "");
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function normalizePool(row: Record<string, unknown>) {
  const assetInfos = Array.isArray(row.asset_infos) ? row.asset_infos : [];
  const assets = assetInfos.map((asset) => ({ denom: normalizeAssetInfo(asset), valueUsd: null, valueJuno: null, priceUsd: null, priceJuno: null, priceStatus: "missing" }));
  const updatedAt = iso(row.updated_at ?? row.state_updated_at) ?? new Date(0).toISOString();
  return {
    id: String(row.id ?? row.pool_id ?? row.pair_address),
    pair: String(row.pair_address),
    pairAddress: String(row.pair_address),
    lpToken: row.liquidity_token_address ? String(row.liquidity_token_address) : null,
    poolType: row.pool_type ? String(row.pool_type) : null,
    assets,
    tvlUsd: toNumber(row.tvl_usd),
    tvlJuno: toNumber(row.tvl_juno),
    volume24hUsd: toNumber(row.volume_24h_usd),
    volume24hJuno: toNumber(row.volume_24h_juno),
    volume7dUsd: toNumber(row.volume_7d_usd),
    volume7dJuno: toNumber(row.volume_7d_juno),
    fees24hUsd: toNumber(row.fees_24h_usd),
    fees24hJuno: toNumber(row.fees_24h_juno),
    feeBps: toNumber(row.fee_bps),
    feeApr: toNumber(row.fee_apr) ?? 0,
    incentivesApr: toNumber(row.incentives_apr) ?? 0,
    totalApr: toNumber(row.total_apr) ?? 0,
    incentivized: Boolean(row.incentivized),
    updatedAt,
    dataSource: "indexer",
    isMock: false,
  };
}

function normalizePrice(row: Record<string, unknown> | undefined, asset: string) {
  if (!row) return { asset, priceUsd: null, priceJuno: null, source: null, status: "missing", stale: false, observedAt: null, ageMs: null, isMock: false };
  const observedAt = iso(row.observed_at);
  const ageMs = observedAt ? Date.now() - new Date(observedAt).getTime() : null;
  const status = String(row.status ?? (row.price_usd || row.price_juno ? "fresh" : "missing"));
  return { asset: String(row.asset ?? asset), priceUsd: toNumber(row.price_usd), priceJuno: toNumber(row.price_juno), source: row.source ? String(row.source) : null, status, stale: status === "stale", observedAt, ageMs, isMock: false };
}

export class PostgresApiStore implements IndexerApiStore {
  private readonly rpc?: JunoRpcClient;
  private readonly expectedMigrationCount?: number;

  constructor(private readonly db: Queryable, private readonly chainId: string, private readonly cursorId = "astroport-juno-v1", options: StoreOptions = {}) {
    this.rpc = options.rpcUrl ? new JunoRpcClient(options.rpcUrl) : undefined;
    this.expectedMigrationCount = options.expectedMigrationCount;
  }

  private async chainHead(): Promise<{ height: number; hash: string } | null> {
    if (!this.rpc) return null;
    try {
      return await this.rpc.head();
    } catch {
      return null;
    }
  }

  async health() {
    const cursor = await this.db.query(`SELECT last_height, last_block_hash, updated_at FROM indexer_cursors WHERE id = $1`, [this.cursorId]);
    const cursorHeight = toNumber(cursor.rows[0]?.last_height);
    const head = await this.chainHead();
    return {
      status: "ok",
      service: "astroport-juno-indexer",
      chainId: this.chainId,
      cursorHeight,
      cursorBlockHash: cursor.rows[0]?.last_block_hash ? String(cursor.rows[0].last_block_hash) : null,
      cursorUpdatedAt: iso(cursor.rows[0]?.updated_at),
      headHeight: head?.height ?? null,
      lag: head && cursorHeight !== null ? Math.max(0, head.height - cursorHeight) : null,
      rpcReachable: head !== null,
      dataSource: "indexer",
      isMock: false,
    };
  }

  async ready() {
    await this.db.query("SELECT 1");
    const migrations = await this.db.query(`SELECT count(*)::int AS count FROM schema_migrations`);
    const migrationsApplied = Number(migrations.rows[0]?.count ?? 0);
    const head = await this.chainHead();
    const migrationsCurrent = this.expectedMigrationCount === undefined || migrationsApplied >= this.expectedMigrationCount;
    const rpcRequired = Boolean(this.rpc);
    const rpcOk = !rpcRequired || head !== null;
    return {
      status: migrationsCurrent && rpcOk ? "ready" : "not_ready",
      checks: { database: true, migrations: migrationsCurrent, rpc: rpcOk },
      database: "ok",
      migrationsApplied,
      expectedMigrations: this.expectedMigrationCount ?? null,
      rpcReachable: head !== null,
      headHeight: head?.height ?? null,
      dataSource: "indexer",
      isMock: false,
    };
  }

  async stats() {
    const result = await this.db.query(
      `SELECT count(DISTINCT p.id)::int AS pool_count,
              count(DISTINCT ie.lp_token_address)::int AS incentivized_pools,
              max(COALESCE(lps.state_updated_at, p.updated_at)) AS updated_at,
              sum(lps.tvl_usd) FILTER (WHERE lps.tvl_usd IS NOT NULL) AS tvl_usd,
              sum(lps.tvl_juno) FILTER (WHERE lps.tvl_juno IS NOT NULL) AS tvl_juno,
              sum(lps.volume_24h_usd) FILTER (WHERE lps.volume_24h_usd IS NOT NULL) AS volume_24h_usd,
              sum(lps.volume_24h_juno) FILTER (WHERE lps.volume_24h_juno IS NOT NULL) AS volume_24h_juno,
              sum(lps.volume_7d_usd) FILTER (WHERE lps.volume_7d_usd IS NOT NULL) AS volume_7d_usd,
              sum(lps.volume_7d_juno) FILTER (WHERE lps.volume_7d_juno IS NOT NULL) AS volume_7d_juno,
              sum(lps.fees_24h_usd) FILTER (WHERE lps.fees_24h_usd IS NOT NULL) AS fees_24h_usd,
              sum(lps.fees_24h_juno) FILTER (WHERE lps.fees_24h_juno IS NOT NULL) AS fees_24h_juno
       FROM pools p
       LEFT JOIN latest_pool_states lps ON lps.chain_id = p.chain_id AND lps.pair_address = p.pair_address
       LEFT JOIN (SELECT DISTINCT chain_id, lp_token_address FROM incentive_events WHERE lp_token_address IS NOT NULL) ie
         ON ie.chain_id = p.chain_id AND ie.lp_token_address = p.liquidity_token_address
       WHERE p.chain_id = $1`,
      [this.chainId],
    );
    const row = result.rows[0] ?? {};
    return {
      poolCount: Number(row.pool_count ?? 0),
      tvlUsd: hasValue(row.tvl_usd) ? toNumber(row.tvl_usd) : null,
      tvlJuno: hasValue(row.tvl_juno) ? toNumber(row.tvl_juno) : null,
      volume24hUsd: hasValue(row.volume_24h_usd) ? toNumber(row.volume_24h_usd) : null,
      volume24hJuno: hasValue(row.volume_24h_juno) ? toNumber(row.volume_24h_juno) : null,
      volume7dUsd: hasValue(row.volume_7d_usd) ? toNumber(row.volume_7d_usd) : null,
      volume7dJuno: hasValue(row.volume_7d_juno) ? toNumber(row.volume_7d_juno) : null,
      fees24hUsd: hasValue(row.fees_24h_usd) ? toNumber(row.fees_24h_usd) : null,
      fees24hJuno: hasValue(row.fees_24h_juno) ? toNumber(row.fees_24h_juno) : null,
      incentivizedPools: Number(row.incentivized_pools ?? 0),
      updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
      dataSource: "indexer",
      isMock: false,
    };
  }

  async prices(assets: string[]) {
    const result = await this.db.query(
      `SELECT DISTINCT ON (asset) asset, price_usd, price_juno, source, status, observed_at
       FROM token_prices WHERE chain_id = $1 AND asset = ANY($2::text[])
       ORDER BY asset, observed_at DESC`,
      [this.chainId, assets],
    );
    const byAsset = new Map(result.rows.map((row: Record<string, unknown>) => [String(row.asset), row]));
    return assets.map((asset) => normalizePrice(byAsset.get(asset), asset));
  }

  async pools(query: PaginationQuery) {
    const safeLimit = limit(query);
    const result = await this.db.query(
      `SELECT p.*, lps.tvl_usd, lps.tvl_juno, lps.volume_24h_usd, lps.volume_24h_juno,
              lps.volume_7d_usd, lps.volume_7d_juno, lps.fees_24h_usd, lps.fees_24h_juno,
              lps.state_updated_at
       FROM pools p
       LEFT JOIN latest_pool_states lps ON lps.chain_id = p.chain_id AND lps.pair_address = p.pair_address
       WHERE p.chain_id = $1 AND ($2::text IS NULL OR p.pair_address = $2)
       ORDER BY COALESCE(lps.tvl_usd, 0) DESC, p.created_height DESC NULLS LAST
       LIMIT $3 OFFSET $4`,
      [this.chainId, query.pair ?? null, safeLimit, offset(query)],
    );
    return page(result.rows.map(normalizePool), query);
  }

  async pool(id: string) {
    const result = await this.db.query(
      `SELECT p.*, lps.tvl_usd, lps.tvl_juno, lps.volume_24h_usd, lps.volume_24h_juno,
              lps.volume_7d_usd, lps.volume_7d_juno, lps.fees_24h_usd, lps.fees_24h_juno,
              lps.state_updated_at
       FROM pools p
       LEFT JOIN latest_pool_states lps ON lps.chain_id = p.chain_id AND lps.pair_address = p.pair_address
       WHERE p.chain_id = $1 AND (p.id::text = $2 OR p.pair_address = $2) LIMIT 1`,
      [this.chainId, id],
    );
    return result.rows[0] ? normalizePool(result.rows[0]) : null;
  }

  async candles(id: string, query: PaginationQuery) {
    const interval = query.interval ?? "1h";
    if (!CANDLE_INTERVALS.has(interval)) throw new RangeError(`unsupported interval: ${interval}`);
    const pool = await this.pool(id);
    if (!pool) return null;
    const pairAddress = String(pool.pairAddress);
    const safeLimit = limit(query, MAX_CANDLE_LIMIT);
    const result = await this.db.query(
      `SELECT pair_address, pool_id, asset, quote_asset, interval, bucket_start, open, high, low, close, volume, volume_quote, trade_count
       FROM token_candles
       WHERE chain_id = $1 AND pair_address = $2 AND interval = $3
         AND ($4::text IS NULL OR asset = $4)
         AND ($5::text IS NULL OR quote_asset = $5)
         AND ($6::timestamptz IS NULL OR bucket_start >= $6)
         AND ($7::timestamptz IS NULL OR bucket_start <= $7)
       ORDER BY bucket_start DESC LIMIT $8 OFFSET $9`,
      [this.chainId, pairAddress, interval, query.baseAsset ?? null, query.quoteAsset ?? null, query.from ?? null, query.to ?? null, safeLimit, offset(query)],
    );
    const data = result.rows.map((row: Record<string, unknown>) => ({ poolId: row.pool_id ? String(row.pool_id) : String(pool.id), pairAddress: String(row.pair_address), baseAsset: String(row.asset), quoteAsset: String(row.quote_asset), interval: String(row.interval), bucketStart: iso(row.bucket_start), open: toNumber(row.open), high: toNumber(row.high), low: toNumber(row.low), close: toNumber(row.close), volume: toNumber(row.volume), volumeQuote: toNumber(row.volume_quote), tradeCount: Number(row.trade_count ?? 0), dataSource: "indexer", isMock: false }));
    return { ...page(data, query, MAX_CANDLE_LIMIT), meta: { poolId: String(pool.id), pairAddress, interval, baseAsset: query.baseAsset ?? null, quoteAsset: query.quoteAsset ?? null, from: query.from ?? null, to: query.to ?? null, dataSource: "indexer", isMock: false } };
  }

  async poolPositions(id: string, query: PaginationQuery) {
    const result = await this.db.query(`SELECT * FROM positions WHERE chain_id = $1 AND (pool_id::text = $2 OR pair_address = $2) ORDER BY updated_at DESC LIMIT $3 OFFSET $4`, [this.chainId, id, limit(query), offset(query)]);
    return page(result.rows.map(normalizePosition), query);
  }

  async walletPositions(addr: string, query: PaginationQuery) {
    const result = await this.db.query(`SELECT * FROM positions WHERE chain_id = $1 AND owner_address = $2 ORDER BY updated_at DESC LIMIT $3 OFFSET $4`, [this.chainId, addr, limit(query), offset(query)]);
    return page(result.rows.map(normalizePosition), query);
  }

  async walletHistory(addr: string, query: PaginationQuery) {
    const result = await this.db.query(
      `SELECT tx_hash, wallet_address, pair_address, type, height, timestamp,
              offer_asset, ask_asset, amount_usd, fee_usd, success
       FROM (
         SELECT tx_hash, trader AS wallet_address, pair_address, 'swap'::text AS type, height, block_time AS timestamp,
                jsonb_build_object('denom', offer_asset, 'amount', offer_amount::text) AS offer_asset,
                jsonb_build_object('denom', ask_asset, 'amount', return_amount::text) AS ask_asset,
                NULL::numeric AS amount_usd,
                NULL::numeric AS fee_usd,
                true AS success
         FROM swaps WHERE chain_id = $1 AND trader = $2
         UNION ALL
         SELECT tx_hash, provider AS wallet_address, pair_address, kind::text AS type, height, block_time AS timestamp,
                NULL::jsonb AS offer_asset,
                NULL::jsonb AS ask_asset,
                NULL::numeric AS amount_usd,
                NULL::numeric AS fee_usd,
                true AS success
         FROM liquidity_events WHERE chain_id = $1 AND provider = $2
         UNION ALL
         SELECT tx_hash, user_address AS wallet_address, NULL::text AS pair_address, action AS type, height, block_time AS timestamp,
                NULL::jsonb AS offer_asset,
                CASE WHEN reward_asset IS NOT NULL OR reward_amount IS NOT NULL THEN jsonb_build_object('denom', reward_asset, 'amount', reward_amount::text) ELSE NULL::jsonb END AS ask_asset,
                NULL::numeric AS amount_usd,
                NULL::numeric AS fee_usd,
                true AS success
         FROM incentive_events WHERE chain_id = $1 AND user_address = $2
       ) events
       ORDER BY height DESC, timestamp DESC LIMIT $3 OFFSET $4`,
      [this.chainId, addr, limit(query), offset(query)],
    );
    return page(result.rows.map(normalizeTx), query);
  }
}

function normalizePosition(row: Record<string, unknown>) {
  return { walletAddress: String(row.owner_address), poolId: String(row.pool_id ?? row.pair_address), pairAddress: String(row.pair_address), lpToken: row.lp_token_address ? String(row.lp_token_address) : null, lpBalance: String(row.lp_balance ?? "0"), bondedBalance: String(row.bonded_balance ?? "0"), shareBps: 0, valueUsd: null, valueJuno: null, assets: [], updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(), dataSource: "indexer", isMock: false };
}

function normalizeTx(row: Record<string, unknown>) {
  return { txHash: String(row.tx_hash), walletAddress: row.wallet_address ? String(row.wallet_address) : null, poolId: row.pair_address ? String(row.pair_address) : null, pairAddress: row.pair_address ? String(row.pair_address) : null, type: String(row.type), height: Number(row.height), timestamp: iso(row.timestamp) ?? new Date(0).toISOString(), offerAsset: row.offer_asset ?? null, askAsset: row.ask_asset ?? null, amountUsd: toNumber(row.amount_usd), feeUsd: toNumber(row.fee_usd), success: Boolean(row.success), dataSource: "indexer", isMock: false };
}
