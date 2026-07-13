import { JunoRpcClient } from "./rpc.js";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CANDLE_LIMIT = 500;
const CANDLE_INTERVALS = new Set(["5m", "1h", "1d"]);
function limit(query, max = MAX_LIMIT) {
    const parsed = Number.parseInt(query.limit ?? String(DEFAULT_LIMIT), 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return DEFAULT_LIMIT;
    return Math.min(parsed, max);
}
function offset(query) {
    const parsed = Number.parseInt(query.cursor ?? "0", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
function page(rows, query, max = MAX_LIMIT) {
    const safeLimit = limit(query, max);
    const start = offset(query);
    return { data: rows, pagination: { limit: safeLimit, nextCursor: rows.length === safeLimit ? String(start + safeLimit) : null } };
}
function toNumber(value) {
    if (value === null || value === undefined)
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function iso(value) {
    if (!value)
        return null;
    return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
function normalizeAssetInfo(value) {
    if (typeof value === "string")
        return value;
    if (value && typeof value === "object") {
        const obj = value;
        if (typeof obj.native_token === "object" && obj.native_token)
            return String(obj.native_token.denom ?? "");
        if (typeof obj.token === "object" && obj.token)
            return String(obj.token.contract_addr ?? "");
    }
    return String(value ?? "");
}
function hasValue(value) {
    return value !== null && value !== undefined;
}
function jsonArray(value) {
    if (Array.isArray(value))
        return value;
    if (typeof value !== "string")
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function reserveAmountFor(asset, reserves) {
    for (const reserve of reserves) {
        if (!reserve || typeof reserve !== "object")
            continue;
        const row = reserve;
        const denom = normalizeAssetInfo(row.denom ?? row.asset ?? row.info ?? row.asset_info);
        if (denom === asset && hasValue(row.amount))
            return String(row.amount);
    }
    return null;
}
function baseAmount(value) {
    const raw = String(value ?? "0");
    return /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}
function decimalRatio(numerator, denominator) {
    if (denominator <= 0n)
        return 0;
    const scaled = (numerator * 1000000000000n) / denominator;
    return Number(scaled) / 1_000_000_000_000;
}
function prorateBaseAmount(amount, numerator, denominator) {
    if (denominator <= 0n)
        return "0";
    return ((baseAmount(amount) * numerator) / denominator).toString();
}
function normalizePool(row) {
    const assetInfos = Array.isArray(row.asset_infos) ? row.asset_infos : [];
    const reserves = jsonArray(row.reserves);
    const assets = assetInfos.map((asset) => {
        const denom = normalizeAssetInfo(asset);
        return { denom, reserve: reserveAmountFor(denom, reserves), valueUsd: null, valueJuno: null, priceUsd: null, priceJuno: null, priceStatus: "missing" };
    });
    const updatedAt = iso(row.updated_at ?? row.state_updated_at) ?? new Date(0).toISOString();
    return {
        id: String(row.id ?? row.pool_id ?? row.pair_address),
        pair: String(row.pair_address),
        pairAddress: String(row.pair_address),
        lpToken: row.liquidity_token_address ? String(row.liquidity_token_address) : null,
        poolType: row.pool_type ? String(row.pool_type) : null,
        assets,
        totalShare: row.total_share ? String(row.total_share) : null,
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
function normalizePrice(row, asset) {
    if (!row)
        return { asset, priceUsd: null, priceJuno: null, source: null, status: "missing", stale: false, observedAt: null, ageMs: null, isMock: false };
    const observedAt = iso(row.observed_at);
    const ageMs = observedAt ? Date.now() - new Date(observedAt).getTime() : null;
    const status = String(row.status ?? (row.price_usd || row.price_juno ? "fresh" : "missing"));
    return { asset: String(row.asset ?? asset), priceUsd: toNumber(row.price_usd), priceJuno: toNumber(row.price_juno), source: row.source ? String(row.source) : null, status, stale: status === "stale", observedAt, ageMs, isMock: false };
}
export class PostgresApiStore {
    db;
    chainId;
    cursorId;
    rpc;
    expectedMigrationCount;
    expectedMigrationVersions;
    confirmationDepth;
    constructor(db, chainId, cursorId = "astroport-juno-v1", options = {}) {
        this.db = db;
        this.chainId = chainId;
        this.cursorId = cursorId;
        this.rpc = options.rpcUrl ? new JunoRpcClient(options.rpcUrl) : undefined;
        this.expectedMigrationVersions = options.expectedMigrationVersions;
        this.expectedMigrationCount = options.expectedMigrationCount ?? options.expectedMigrationVersions?.length;
        this.confirmationDepth = Math.max(0, options.confirmationDepth ?? 0);
    }
    async chainHead() {
        if (!this.rpc)
            return null;
        try {
            return await this.rpc.head();
        }
        catch {
            return null;
        }
    }
    healthFrom(cursorRow, head) {
        const cursorHeight = toNumber(cursorRow?.last_height);
        const cursorUpdatedAt = iso(cursorRow?.updated_at);
        const cursorAgeMs = cursorUpdatedAt ? Math.max(0, Date.now() - new Date(cursorUpdatedAt).getTime()) : null;
        const confirmedTargetHeight = head ? Math.max(0, head.height - this.confirmationDepth) : null;
        return {
            status: "ok",
            service: "astroport-juno-indexer",
            chainId: this.chainId,
            confirmationDepth: this.confirmationDepth,
            cursorHeight,
            cursorBlockHash: cursorRow?.last_block_hash ? String(cursorRow.last_block_hash) : null,
            cursorUpdatedAt,
            cursorAgeMs,
            headHeight: head?.height ?? null,
            confirmedTargetHeight,
            lag: head && cursorHeight !== null ? Math.max(0, head.height - cursorHeight) : null,
            confirmedLag: confirmedTargetHeight !== null && cursorHeight !== null ? Math.max(0, confirmedTargetHeight - cursorHeight) : null,
            rpcConfigured: Boolean(this.rpc),
            rpcReachable: head !== null,
            dataSource: "indexer",
            isMock: false,
        };
    }
    readyFrom(appliedVersions, head) {
        const migrationsApplied = appliedVersions.length;
        const missingMigrations = this.expectedMigrationVersions?.filter((version) => !appliedVersions.includes(version)) ?? [];
        const migrationsCurrent = this.expectedMigrationVersions
            ? missingMigrations.length === 0
            : this.expectedMigrationCount === undefined || migrationsApplied >= this.expectedMigrationCount;
        const rpcRequired = Boolean(this.rpc);
        const rpcOk = !rpcRequired || head !== null;
        return {
            status: migrationsCurrent && rpcOk ? "ready" : "not_ready",
            checks: { database: true, migrations: migrationsCurrent, rpc: rpcOk },
            database: "ok",
            migrationsApplied,
            expectedMigrations: this.expectedMigrationCount ?? null,
            missingMigrations,
            rpcConfigured: rpcRequired,
            rpcReachable: head !== null,
            headHeight: head?.height ?? null,
            dataSource: "indexer",
            isMock: false,
        };
    }
    async health() {
        const [cursor, head] = await Promise.all([
            this.db.query(`SELECT last_height, last_block_hash, updated_at FROM indexer_cursors WHERE id = $1`, [this.cursorId]),
            this.chainHead(),
        ]);
        return this.healthFrom(cursor.rows[0], head);
    }
    async ready() {
        await this.db.query("SELECT 1");
        const [migrations, head] = await Promise.all([
            this.db.query(`SELECT version FROM schema_migrations ORDER BY version`),
            this.chainHead(),
        ]);
        return this.readyFrom(migrations.rows.map((row) => row.version), head);
    }
    async opsStatus() {
        const [cursor, migrations, head] = await Promise.all([
            this.db.query(`SELECT last_height, last_block_hash, updated_at FROM indexer_cursors WHERE id = $1`, [this.cursorId]),
            (async () => {
                await this.db.query("SELECT 1");
                return this.db.query(`SELECT version FROM schema_migrations ORDER BY version`);
            })(),
            this.chainHead(),
        ]);
        return { health: this.healthFrom(cursor.rows[0], head), ready: this.readyFrom(migrations.rows.map((row) => row.version), head) };
    }
    async stats() {
        const result = await this.db.query(`SELECT pool_count, incentivized_pools, updated_at, tvl_usd, tvl_juno,
              volume_24h_usd, volume_24h_juno, volume_7d_usd, volume_7d_juno,
              fees_24h_usd, fees_24h_juno
       FROM protocol_stats_latest
       WHERE chain_id = $1`, [this.chainId]);
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
    async prices(assets) {
        const result = await this.db.query(`SELECT DISTINCT ON (asset) asset, price_usd, price_juno, source, status, observed_at
       FROM token_prices WHERE chain_id = $1 AND asset = ANY($2::text[])
       ORDER BY asset, observed_at DESC`, [this.chainId, assets]);
        const byAsset = new Map(result.rows.map((row) => [String(row.asset), row]));
        return assets.map((asset) => normalizePrice(byAsset.get(asset), asset));
    }
    async pools(query) {
        const safeLimit = limit(query);
        const result = await this.db.query(`SELECT pool_id AS id, chain_id, pair_address, liquidity_token_address, pool_type,
              asset_infos, created_height, created_tx_hash, first_seen_at, pool_updated_at AS updated_at,
              reserves, total_share, tvl_usd, tvl_juno, volume_24h_usd, volume_24h_juno,
              volume_7d_usd, volume_7d_juno, fees_24h_usd, fees_24h_juno, state_updated_at
       FROM latest_pool_state
       WHERE chain_id = $1 AND ($2::text IS NULL OR pair_address = $2)
       ORDER BY COALESCE(tvl_usd, 0) DESC, created_height DESC NULLS LAST
       LIMIT $3 OFFSET $4`, [this.chainId, query.pair ?? null, safeLimit, offset(query)]);
        return page(result.rows.map(normalizePool), query);
    }
    async pool(id) {
        const readModel = await this.db.query(`SELECT pool_id AS id, chain_id, pair_address, liquidity_token_address, pool_type,
              asset_infos, created_height, created_tx_hash, first_seen_at, pool_updated_at AS updated_at,
              reserves, total_share, tvl_usd, tvl_juno, volume_24h_usd, volume_24h_juno,
              volume_7d_usd, volume_7d_juno, fees_24h_usd, fees_24h_juno, state_updated_at
       FROM latest_pool_state
       WHERE chain_id = $1 AND (pool_id::text = $2 OR pair_address = $2) LIMIT 1`, [this.chainId, id]);
        if (readModel.rows[0])
            return normalizePool(readModel.rows[0]);
        const result = await this.db.query(`SELECT p.*, lps.reserves, lps.total_share, lps.tvl_usd, lps.tvl_juno, lps.volume_24h_usd, lps.volume_24h_juno,
              lps.volume_7d_usd, lps.volume_7d_juno, lps.fees_24h_usd, lps.fees_24h_juno,
              lps.state_updated_at
       FROM pools p
       LEFT JOIN latest_pool_states lps ON lps.chain_id = p.chain_id AND lps.pair_address = p.pair_address
       WHERE p.chain_id = $1 AND (p.id::text = $2 OR p.pair_address = $2) LIMIT 1`, [this.chainId, id]);
        return result.rows[0] ? normalizePool(result.rows[0]) : null;
    }
    async candles(id, query) {
        const interval = query.interval ?? "1h";
        if (!CANDLE_INTERVALS.has(interval))
            throw new RangeError(`unsupported interval: ${interval}`);
        const pool = await this.pool(id);
        if (!pool)
            return null;
        const pairAddress = String(pool.pairAddress);
        const safeLimit = limit(query, MAX_CANDLE_LIMIT);
        const values = [this.chainId, pairAddress, interval, query.baseAsset ?? null, query.quoteAsset ?? null, query.from ?? null, query.to ?? null, safeLimit, offset(query)];
        let result = await this.db.query(`SELECT pair_address, pool_id, asset, quote_asset, interval, bucket_start, open, high, low, close, volume, volume_quote, trade_count
       FROM pool_candle_buckets
       WHERE chain_id = $1 AND pair_address = $2 AND interval = $3
         AND ($4::text IS NULL OR asset = $4)
         AND ($5::text IS NULL OR quote_asset = $5)
         AND ($6::timestamptz IS NULL OR bucket_start >= $6)
         AND ($7::timestamptz IS NULL OR bucket_start <= $7)
       ORDER BY bucket_start DESC LIMIT $8 OFFSET $9`, values);
        const filterFallback = result.rows.length === 0 && Boolean(query.baseAsset || query.quoteAsset);
        if (filterFallback) {
            result = await this.db.query(`SELECT pair_address, pool_id, asset, quote_asset, interval, bucket_start, open, high, low, close, volume, volume_quote, trade_count
         FROM pool_candle_buckets
         WHERE chain_id = $1 AND pair_address = $2 AND interval = $3
           AND ($4::timestamptz IS NULL OR bucket_start >= $4)
           AND ($5::timestamptz IS NULL OR bucket_start <= $5)
         ORDER BY bucket_start DESC LIMIT $6 OFFSET $7`, [this.chainId, pairAddress, interval, query.from ?? null, query.to ?? null, safeLimit, offset(query)]);
        }
        const data = result.rows.map((row) => ({ poolId: row.pool_id ? String(row.pool_id) : String(pool.id), pairAddress: String(row.pair_address), baseAsset: String(row.asset), quoteAsset: String(row.quote_asset), interval: String(row.interval), bucketStart: iso(row.bucket_start), open: toNumber(row.open), high: toNumber(row.high), low: toNumber(row.low), close: toNumber(row.close), volume: toNumber(row.volume), volumeQuote: toNumber(row.volume_quote), tradeCount: Number(row.trade_count ?? 0), dataSource: "indexer", isMock: false }));
        return { ...page(data, query, MAX_CANDLE_LIMIT), meta: { poolId: String(pool.id), pairAddress, interval, baseAsset: filterFallback ? null : query.baseAsset ?? null, quoteAsset: filterFallback ? null : query.quoteAsset ?? null, requestedBaseAsset: query.baseAsset ?? null, requestedQuoteAsset: query.quoteAsset ?? null, filterFallback, from: query.from ?? null, to: query.to ?? null, dataSource: "indexer", isMock: false } };
    }
    async poolPositions(id, query) {
        const result = await this.db.query(`SELECT w.wallet_address AS owner_address, w.pool_id, w.pair_address, w.lp_token_address,
              w.lp_balance, w.bonded_balance, w.updated_at,
              lps.asset_infos, lps.reserves, lps.total_share, lps.tvl_usd, lps.tvl_juno
       FROM wallet_position_latest w
       LEFT JOIN latest_pool_state lps ON lps.chain_id = w.chain_id AND lps.pair_address = w.pair_address
       WHERE w.chain_id = $1 AND (w.pool_id::text = $2 OR w.pair_address = $2)
       ORDER BY w.updated_at DESC LIMIT $3 OFFSET $4`, [this.chainId, id, limit(query), offset(query)]);
        return page(result.rows.map(normalizePosition), query);
    }
    async poolHistory(id, query) {
        const pool = await this.pool(id);
        if (!pool)
            return page([], query);
        const pairAddress = String(pool.pairAddress);
        const result = await this.db.query(`SELECT tx_hash, wallet_address, pair_address, type, height, timestamp,
              offer_asset, ask_asset, amount_usd, fee_usd, success
       FROM wallet_history_flat
       WHERE chain_id = $1 AND pair_address = $2
       ORDER BY height DESC, timestamp DESC LIMIT $3 OFFSET $4`, [this.chainId, pairAddress, limit(query), offset(query)]);
        return page(result.rows.map(normalizeTx), query);
    }
    async walletPositions(addr, query) {
        const result = await this.db.query(`SELECT w.wallet_address AS owner_address, w.pool_id, w.pair_address, w.lp_token_address,
              w.lp_balance, w.bonded_balance, w.updated_at,
              lps.asset_infos, lps.reserves, lps.total_share, lps.tvl_usd, lps.tvl_juno
       FROM wallet_position_latest w
       LEFT JOIN latest_pool_state lps ON lps.chain_id = w.chain_id AND lps.pair_address = w.pair_address
       WHERE w.chain_id = $1 AND w.wallet_address = $2
       ORDER BY w.updated_at DESC LIMIT $3 OFFSET $4`, [this.chainId, addr, limit(query), offset(query)]);
        return page(result.rows.map(normalizePosition), query);
    }
    async walletHistory(addr, query) {
        const result = await this.db.query(`SELECT tx_hash, wallet_address, pair_address, type, height, timestamp,
              offer_asset, ask_asset, amount_usd, fee_usd, success
       FROM wallet_history_flat
       WHERE chain_id = $1 AND wallet_address = $2
       ORDER BY height DESC, timestamp DESC LIMIT $3 OFFSET $4`, [this.chainId, addr, limit(query), offset(query)]);
        return page(result.rows.map(normalizeTx), query);
    }
}
function normalizePosition(row) {
    const lpBalance = String(row.lp_balance ?? "0");
    const bondedBalance = String(row.bonded_balance ?? "0");
    const totalPositionLp = baseAmount(lpBalance) + baseAmount(bondedBalance);
    const totalShare = baseAmount(row.total_share);
    const share = decimalRatio(totalPositionLp, totalShare);
    const assetInfos = Array.isArray(row.asset_infos) ? row.asset_infos : [];
    const reserves = jsonArray(row.reserves);
    const assets = assetInfos.map((asset) => {
        const denom = normalizeAssetInfo(asset);
        return {
            denom,
            reserve: reserveAmountFor(denom, reserves),
            amount: prorateBaseAmount(reserveAmountFor(denom, reserves), totalPositionLp, totalShare),
            valueUsd: null,
            valueJuno: null,
            priceUsd: null,
            priceJuno: null,
            priceStatus: "missing",
        };
    });
    const tvlUsd = toNumber(row.tvl_usd);
    const tvlJuno = toNumber(row.tvl_juno);
    return {
        walletAddress: String(row.owner_address),
        poolId: String(row.pool_id ?? row.pair_address),
        pairAddress: String(row.pair_address),
        lpToken: row.lp_token_address ? String(row.lp_token_address) : null,
        lpBalance,
        bondedBalance,
        shareBps: Math.round(share * 10_000),
        valueUsd: tvlUsd === null || share <= 0 ? null : tvlUsd * share,
        valueJuno: tvlJuno === null || share <= 0 ? null : tvlJuno * share,
        assets,
        updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
        dataSource: "indexer",
        isMock: false,
    };
}
function normalizeTx(row) {
    return { txHash: String(row.tx_hash), walletAddress: row.wallet_address ? String(row.wallet_address) : null, poolId: row.pair_address ? String(row.pair_address) : null, pairAddress: row.pair_address ? String(row.pair_address) : null, type: String(row.type), height: Number(row.height), timestamp: iso(row.timestamp) ?? new Date(0).toISOString(), offerAsset: row.offer_asset ?? null, askAsset: row.ask_asset ?? null, amountUsd: toNumber(row.amount_usd), feeUsd: toNumber(row.fee_usd), success: Boolean(row.success), dataSource: "indexer", isMock: false };
}
