import { loadConfig } from "./config.js";
import { createPool, runMigrations } from "./db.js";
import { Indexer } from "./indexer.js";
import { parseNonNegativeInteger } from "./ranges.js";
function intArg(name) {
    const prefix = `--${name}=`;
    const arg = process.argv.find((value) => value.startsWith(prefix));
    const raw = arg ? arg.slice(prefix.length) : process.env[name.toUpperCase().replace(/-/g, "_")];
    if (!raw)
        return undefined;
    return parseNonNegativeInteger(raw, name);
}
function isRpcLikeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /\b(RPC|LCD|fetch|status|block_results|\/block\?|\/status)\b/i.test(message);
}
async function setCursor(pool, params) {
    await pool.query(`INSERT INTO indexer_cursors(id, chain_id, last_height, last_block_hash)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (id) DO UPDATE
     SET chain_id = EXCLUDED.chain_id,
         last_height = EXCLUDED.last_height,
         last_block_hash = NULL,
         updated_at = now()`, [params.cursorId, params.chainId, params.height]);
}
async function getCursorHeight(pool, cursorId) {
    const result = await pool.query(`SELECT last_height FROM indexer_cursors WHERE id = $1`, [cursorId]);
    const raw = result.rows[0]?.last_height;
    return raw === undefined ? null : Number(raw);
}
async function eventCounts(pool, chainId, fromHeight, toHeight) {
    const [pools, swaps, liquidity, incentives] = await Promise.all([
        pool.query(`SELECT count(*)::text AS count
       FROM pools
       WHERE chain_id = $1 AND created_height BETWEEN $2 AND $3`, [chainId, fromHeight, toHeight]),
        pool.query(`SELECT count(*)::text AS count
       FROM swaps
       WHERE chain_id = $1 AND height BETWEEN $2 AND $3`, [chainId, fromHeight, toHeight]),
        pool.query(`SELECT kind, count(*)::text AS count
       FROM liquidity_events
       WHERE chain_id = $1 AND height BETWEEN $2 AND $3
       GROUP BY kind`, [chainId, fromHeight, toHeight]),
        pool.query(`SELECT count(*)::text AS count
       FROM incentive_events
       WHERE chain_id = $1 AND height BETWEEN $2 AND $3`, [chainId, fromHeight, toHeight]),
    ]);
    const liquidityByKind = new Map(liquidity.rows.map((row) => [row.kind, Number(row.count)]));
    return {
        poolsCreated: Number(pools.rows[0]?.count ?? 0),
        swaps: Number(swaps.rows[0]?.count ?? 0),
        liquidityProvides: liquidityByKind.get("provide") ?? 0,
        liquidityWithdraws: liquidityByKind.get("withdraw") ?? 0,
        incentives: Number(incentives.rows[0]?.count ?? 0),
    };
}
const fromHeight = intArg("from-height");
const toHeight = intArg("to-height");
if (fromHeight === undefined)
    throw new Error("missing --from-height=<height> or FROM_HEIGHT");
if (toHeight === undefined)
    throw new Error("missing --to-height=<height> or TO_HEIGHT");
if (toHeight < fromHeight)
    throw new Error("--to-height must be greater than or equal to --from-height");
const config = loadConfig();
const pool = createPool(config);
const indexer = new Indexer({ ...config, dryRun: false, startHeight: fromHeight }, pool);
const start = Date.now();
let blocksProcessed = 0;
let cursor = null;
let head = null;
let target = null;
let rpcErrorCount = 0;
let migrationsApplied = [];
try {
    migrationsApplied = await runMigrations(pool);
    await setCursor(pool, { cursorId: config.cursorId, chainId: config.chainId, height: Math.max(0, fromHeight - 1) });
    for (;;) {
        try {
            const result = await indexer.runUntilHeight(toHeight);
            blocksProcessed += result.processed;
            cursor = result.cursorHeight;
            head = result.head;
            target = result.target;
            if (result.done)
                break;
        }
        catch (error) {
            if (isRpcLikeError(error))
                rpcErrorCount += 1;
            throw error;
        }
    }
    cursor = await getCursorHeight(pool, config.cursorId);
    const durationMs = Date.now() - start;
    const counts = await eventCounts(pool, config.chainId, fromHeight, toHeight);
    const summary = {
        blockRange: { from: fromHeight, to: toHeight },
        durationMs,
        durationSeconds: durationMs / 1000,
        blocksProcessed,
        blocksPerSecond: durationMs > 0 ? blocksProcessed / (durationMs / 1000) : blocksProcessed,
        cursor,
        head,
        target,
        lag: target === null || cursor === null ? null : Math.max(0, target - cursor),
        rpcErrorCount,
        eventCounts: counts,
        migrationsApplied,
    };
    console.log(JSON.stringify(summary));
}
catch (error) {
    const durationMs = Date.now() - start;
    cursor = await getCursorHeight(pool, config.cursorId).catch(() => cursor);
    const summary = {
        blockRange: { from: fromHeight, to: toHeight },
        durationMs,
        durationSeconds: durationMs / 1000,
        blocksProcessed,
        blocksPerSecond: durationMs > 0 ? blocksProcessed / (durationMs / 1000) : blocksProcessed,
        cursor,
        head,
        target,
        lag: target === null || cursor === null ? null : Math.max(0, target - cursor),
        rpcErrorCount,
        eventCounts: { poolsCreated: null, swaps: null, liquidityProvides: null, liquidityWithdraws: null, incentives: null },
        migrationsApplied,
        error: error instanceof Error ? error.message : String(error),
    };
    console.log(JSON.stringify(summary));
    process.exitCode = 1;
}
finally {
    await indexer.close();
    await pool.end();
}
