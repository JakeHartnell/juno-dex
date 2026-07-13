import { randomUUID } from "node:crypto";
import { fetchBlockRange } from "./block-fetcher.js";
import { advanceCursor, createPool, enqueueSnapshotJobs, getCursor, recordProcessedBlock, stageAndMergeBatch, upsertPoolStateSnapshot, writeNormalizedEvents } from "./db.js";
import { normalizeBlockEvents } from "./events.js";
import { JunoRestClient, JunoRpcClient } from "./rpc.js";
import { nextBlockRange } from "./ranges.js";
export class Indexer {
    config;
    metrics;
    rpc;
    rest;
    pool;
    ownsPool;
    constructor(config, pool, metrics) {
        this.config = config;
        this.metrics = metrics;
        this.rpc = new JunoRpcClient(config.rpcUrl, { metrics, timeoutMs: config.rpcTimeoutMs, maxRetries: config.rpcMaxRetries });
        this.rest = new JunoRestClient(config.restUrl);
        this.pool = pool ?? (config.dryRun ? undefined : createPool(config));
        this.ownsPool = !pool && !config.dryRun;
    }
    async close() {
        if (this.ownsPool)
            await this.pool?.end();
    }
    async runOnce(maxHeight) {
        const planned = await this.planRange(maxHeight);
        if (planned.empty)
            return { processed: 0, head: planned.head.height, target: planned.target, cursorHeight: planned.lastHeight };
        const rangeStartedAt = Date.now();
        const blocks = await this.fetchRange(planned.from, planned.to);
        const decoded = blocks.map((block) => this.normalizeBlock(block));
        for (const _block of decoded)
            this.metrics?.recordDecodedBlock();
        const eventCounts = countRangeEvents(decoded);
        let dbDurationMs = 0;
        const writeStartedAt = Date.now();
        let processed = 0;
        try {
            processed = this.shouldUseBulkStaging()
                ? await this.writeBulkStagingBatch(decoded)
                : await this.writeBlocksInOrder(decoded);
            dbDurationMs = Date.now() - writeStartedAt;
        }
        catch (error) {
            dbDurationMs = Date.now() - writeStartedAt;
            if (isReorgHaltError(error))
                this.metrics?.setReorgHalt(true);
            throw error;
        }
        if (!this.config.dryRun) {
            this.metrics?.recordWriterEvents(eventCounts);
            if (processed > 0)
                this.metrics?.recordWriterBlock(dbDurationMs / 1000);
        }
        this.metrics?.setReorgHalt(false);
        console.log(JSON.stringify({
            msg: "indexer_range_processed",
            role: "indexer",
            rangeFrom: planned.from,
            rangeTo: planned.to,
            cursor: planned.to,
            head: planned.head.height,
            target: planned.target,
            lag: Math.max(0, planned.target - planned.to),
            blocks: processed,
            swaps: eventCounts.swap ?? 0,
            liquidityEvents: (eventCounts.provide ?? 0) + (eventCounts.withdraw ?? 0),
            incentiveEvents: eventCounts.incentive ?? 0,
            durationMs: Date.now() - rangeStartedAt,
            dbDurationMs,
        }));
        return { processed, head: planned.head.height, target: planned.target, cursorHeight: planned.to };
    }
    async runForever() {
        for (;;) {
            const result = await this.runOnce();
            console.log(`indexer loop processed=${result.processed} head=${result.head} target=${result.target}`);
            await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
        }
    }
    async runUntilHeight(maxHeight) {
        const result = await this.runOnce(maxHeight);
        if (result.cursorHeight < maxHeight && result.processed === 0) {
            throw new Error(`confirmed target ${result.target} is below requested to-height ${maxHeight}; cursor is at ${result.cursorHeight}`);
        }
        return { ...result, done: result.cursorHeight >= maxHeight };
    }
    async planRange(maxHeight) {
        const head = await this.rpc.head();
        const target = Math.max(0, head.height - this.config.confirmationDepth);
        const lastHeight = this.config.dryRun
            ? Math.max(0, this.config.startHeight - 1)
            : await withClient(this.pool, (client) => getCursor(client, this.config.cursorId, this.config.chainId, this.config.startHeight));
        const { from, to, empty } = nextBlockRange({ lastHeight, confirmedTarget: target, batchSize: this.config.batchSize, maxHeight });
        return { head, target, lastHeight, from, to, empty };
    }
    fetchRange(from, to) {
        return fetchBlockRange({
            rpc: this.rpc,
            from,
            to,
            concurrency: this.config.indexerMode === "catchup" ? this.config.fetchConcurrency : this.config.realtimeFetchConcurrency,
        });
    }
    normalizeBlock(block) {
        const events = block.txEvents.flatMap((tx) => normalizeBlockEvents(tx.events, { chainId: this.config.chainId, height: block.height, blockTime: block.time, txHash: tx.txHash }, { factoryAddress: this.config.factoryAddress, incentivesAddress: this.config.incentivesAddress }));
        return { block, events };
    }
    shouldUseBulkStaging() {
        return !this.config.dryRun
            && this.config.indexerMode === "catchup"
            && this.config.ingestBulkStagingEnabled
            && !this.config.ingestCandlesInline;
    }
    async writeBulkStagingBatch(blocks) {
        if (blocks.length === 0)
            return 0;
        await withClient(this.pool, async (client) => {
            await client.query("BEGIN");
            try {
                await stageAndMergeBatch(client, {
                    batchId: randomUUID(),
                    chainId: this.config.chainId,
                    cursorId: this.config.cursorId,
                    blocks: blocks.map(({ block, events }) => ({
                        chainId: this.config.chainId,
                        height: block.height,
                        blockHash: block.hash,
                        parentHash: block.parentHash,
                        blockTime: block.time,
                        txCount: block.txCount,
                        events,
                    })),
                    writeCandlesInline: this.config.ingestCandlesInline,
                    enqueueSnapshots: !this.config.ingestReserveSnapshotsInline,
                });
                await client.query("COMMIT");
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        });
        if (this.config.ingestReserveSnapshotsInline) {
            for (const { block, events } of blocks) {
                await this.writeReserveSnapshots(events, block.height, block.time);
            }
        }
        return blocks.length;
    }
    async writeBlocksInOrder(blocks) {
        let processed = 0;
        for (const { block, events } of blocks) {
            if (this.config.dryRun) {
                console.log(JSON.stringify({ height: block.height, hash: block.hash, events }, null, 2));
            }
            else {
                await this.writeBlock(block, events);
                if (this.config.ingestReserveSnapshotsInline) {
                    await this.writeReserveSnapshots(events, block.height, block.time);
                }
            }
            processed += 1;
        }
        return processed;
    }
    async writeBlock(block, events) {
        await withClient(this.pool, async (client) => {
            await client.query("BEGIN");
            try {
                await recordProcessedBlock(client, {
                    chainId: this.config.chainId,
                    height: block.height,
                    blockHash: block.hash,
                    parentHash: block.parentHash,
                    blockTime: block.time,
                    txCount: block.txCount,
                });
                await writeNormalizedEvents(client, this.config.chainId, events, { writeCandlesInline: this.config.ingestCandlesInline });
                if (!this.config.ingestReserveSnapshotsInline) {
                    await enqueueSnapshotJobs(client, {
                        chainId: this.config.chainId,
                        pairAddresses: touchedPairAddresses(events),
                        height: block.height,
                        blockTime: block.time,
                        reason: "touched",
                    });
                }
                await advanceCursor(client, { cursorId: this.config.cursorId, height: block.height, blockHash: block.hash });
                await client.query("COMMIT");
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        });
    }
    async writeReserveSnapshots(events, height, blockTime) {
        const touchedPairs = touchedPairAddresses(events);
        if (touchedPairs.length === 0)
            return;
        const knownPairs = await withClient(this.pool, async (client) => {
            const result = await client.query(`SELECT pair_address FROM pools WHERE chain_id = $1 AND pair_address = ANY($2::text[])`, [this.config.chainId, touchedPairs]);
            return new Set(result.rows.map((row) => row.pair_address));
        });
        for (const pairAddress of touchedPairs) {
            if (!knownPairs.has(pairAddress))
                continue;
            try {
                const state = await this.rest.poolState(pairAddress, height);
                await withClient(this.pool, async (client) => upsertPoolStateSnapshot(client, {
                    chainId: this.config.chainId,
                    pairAddress,
                    height,
                    blockTime,
                    reserves: state.reserves,
                    totalShare: state.totalShare,
                    source: "lcd",
                }));
            }
            catch (error) {
                console.warn("indexer_reserve_snapshot_failed", { pairAddress, height, error: error instanceof Error ? error.message : String(error) });
            }
        }
    }
}
function touchedPairAddresses(events) {
    return Array.from(new Set(events
        .filter(isPairStateEvent)
        .map((event) => event.pairAddress)
        .filter(Boolean)));
}
function isPairStateEvent(event) {
    return event.kind === "swap" || event.kind === "provide" || event.kind === "withdraw";
}
function countRangeEvents(blocks) {
    const counts = {};
    for (const { events } of blocks) {
        for (const event of events)
            counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    }
    return counts;
}
function isReorgHaltError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /processed block (hash mismatch|parent hash mismatch|conflict)/.test(message);
}
async function withClient(pool, fn) {
    const client = await pool.connect();
    try {
        return await fn(client);
    }
    finally {
        client.release();
    }
}
