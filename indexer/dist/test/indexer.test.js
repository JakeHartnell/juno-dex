import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTRACTS } from "../src/config.js";
import { Indexer } from "../src/indexer.js";
class FakeIndexerClient {
    queries = [];
    failProcessedBlockHeight;
    failStagedMerge = false;
    onBegin;
    async query(text, values) {
        this.queries.push({ text, values });
        if (text === "BEGIN")
            this.onBegin?.();
        if (text.includes("RETURNING last_height"))
            return { rows: [{ last_height: "10" }], rowCount: 1 };
        if (text.includes("FROM processed_blocks"))
            return { rows: [], rowCount: 0 };
        if (text.includes("INSERT INTO processed_blocks") && text.includes("FROM stage_processed_blocks")) {
            if (this.failStagedMerge)
                throw new Error("staged merge failed");
            return { rows: [], rowCount: 1 };
        }
        if (text.includes("INSERT INTO processed_blocks")) {
            if (values?.[1] === this.failProcessedBlockHeight)
                throw new Error(`boom at ${this.failProcessedBlockHeight}`);
            return { rows: [], rowCount: 1 };
        }
        if (text.includes("INSERT INTO swaps"))
            return { rows: [{ id: "swap-1", pool_id: "pool-1" }], rowCount: 1 };
        if (text.includes("FROM asset_metadata"))
            return { rows: [{ asset: "ujuno", decimals: 6 }, { asset: "uusdc", decimals: 6 }], rowCount: 2 };
        if (text.includes("FROM pools") && text.includes("ANY($2::text[])")) {
            const requested = new Set(values?.[1] ?? []);
            const rows = ["juno1pair"].filter((pair) => requested.has(pair)).map((pair_address) => ({ pair_address }));
            return { rows: rows, rowCount: rows.length };
        }
        if (text.includes("FROM pools") && text.includes("pair_address"))
            return { rows: [{ id: "pool-1", pair_address: "juno1pair" }], rowCount: 1 };
        if (text.includes("INSERT INTO token_candles"))
            return { rows: [], rowCount: 1 };
        if (text.includes("INSERT INTO pool_state_snapshots"))
            return { rows: [], rowCount: 1 };
        if (text.includes("INSERT INTO snapshot_jobs"))
            return { rows: [], rowCount: 1 };
        if (text.includes("UPDATE indexer_cursors"))
            return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
    }
    release() { }
}
class FakeIndexerPool {
    client = new FakeIndexerClient();
    async connect() { return this.client; }
}
const baseConfig = {
    databaseUrl: "postgres://test",
    rpcUrl: "https://rpc.example",
    restUrl: "https://lcd.example",
    wsUrl: "wss://rpc.example/websocket",
    chainId: "juno-1",
    factoryAddress: DEFAULT_CONTRACTS.factory,
    routerAddress: DEFAULT_CONTRACTS.router,
    incentivesAddress: DEFAULT_CONTRACTS.incentives,
    oracleAddress: DEFAULT_CONTRACTS.oracle,
    nativeCoinRegistryAddress: DEFAULT_CONTRACTS.nativeCoinRegistry,
    startHeight: 11,
    confirmationDepth: 2,
    pollIntervalMs: 1,
    batchSize: 1,
    dryRun: false,
    cursorId: "astroport-juno-v1",
    indexerMode: "realtime",
    rangeSize: 5_000,
    fetchWindowSize: 250,
    fetchConcurrency: 32,
    realtimeFetchConcurrency: 8,
    rpcTimeoutMs: 10_000,
    rpcMaxRetries: 5,
    ingestCandlesInline: true,
    ingestReserveSnapshotsInline: true,
    ingestAggregatesInline: false,
    ingestBulkStagingEnabled: false,
    priceProviderName: "provider",
    priceCacheTtlMs: 300_000,
    priceStaleAfterMs: 1_800_000,
    priceAllowStale: true,
    priceDevMocks: false,
    readModelRefreshIntervalMs: 0,
    apiPort: 8787,
};
afterEach(() => vi.restoreAllMocks());
function rpcBlock(height, txEvents = []) {
    return {
        block: { result: { block_id: { hash: `block-${height}` }, block: { header: { time: `2026-07-01T03:00:${String(height).padStart(2, "0")}Z`, last_block_id: { hash: `block-${height - 1}` } }, data: { txs: txEvents.length > 0 ? ["AA=="] : [] } } } },
        results: { result: { txs_results: txEvents.length > 0 ? [{ hash: `tx-${height}`, events: txEvents }] : [] } },
    };
}
function mockRpcRange(headHeight, blocks, fetchedBlocks, onBlockFetchStart, onBlockFetchEnd) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url === "https://rpc.example/status") {
            return { ok: true, json: async () => ({ result: { sync_info: { latest_block_height: String(headHeight), latest_block_hash: "head" } } }) };
        }
        const blockMatch = url.match(/^https:\/\/rpc\.example\/block\?height=(\d+)$/);
        if (blockMatch) {
            const height = Number(blockMatch[1]);
            fetchedBlocks?.push(height);
            onBlockFetchStart?.();
            await Promise.resolve();
            onBlockFetchEnd?.();
            return { ok: true, json: async () => blocks.get(height)?.block };
        }
        const resultsMatch = url.match(/^https:\/\/rpc\.example\/block_results\?height=(\d+)$/);
        if (resultsMatch) {
            const height = Number(resultsMatch[1]);
            return { ok: true, json: async () => blocks.get(height)?.results };
        }
        throw new Error(`unexpected fetch: ${url}`);
    });
}
describe("Indexer fetch/decode/ordered writer pipeline", () => {
    it("fetches multiple blocks before ordered writing and advances the cursor height by height", async () => {
        const blocks = new Map([11, 12, 13].map((height) => [height, rpcBlock(height)]));
        const fetchedBlocks = [];
        mockRpcRange(15, blocks, fetchedBlocks);
        const pool = new FakeIndexerPool();
        const fetchedBeforeFirstWrite = [];
        pool.client.onBegin = () => {
            if (fetchedBeforeFirstWrite.length === 0)
                fetchedBeforeFirstWrite.push(...fetchedBlocks);
        };
        await expect(new Indexer({ ...baseConfig, batchSize: 3, fetchConcurrency: 1, realtimeFetchConcurrency: 3 }, pool).runOnce()).resolves.toMatchObject({ processed: 3, cursorHeight: 13 });
        expect(fetchedBeforeFirstWrite.sort((a, b) => a - b)).toEqual([11, 12, 13]);
        const cursorUpdates = pool.client.queries.filter((query) => query.text.includes("UPDATE indexer_cursors"));
        expect(cursorUpdates.map((query) => query.values?.[1])).toEqual([11, 12, 13]);
    });
    it("uses catchup fetch concurrency when the indexer is in catchup mode", async () => {
        const blocks = new Map([11, 12, 13, 14].map((height) => [height, rpcBlock(height)]));
        let activeBlockFetches = 0;
        let maxActiveBlockFetches = 0;
        mockRpcRange(16, blocks, undefined, () => {
            activeBlockFetches += 1;
            maxActiveBlockFetches = Math.max(maxActiveBlockFetches, activeBlockFetches);
        }, () => {
            activeBlockFetches -= 1;
        });
        const pool = new FakeIndexerPool();
        await expect(new Indexer({ ...baseConfig, indexerMode: "catchup", batchSize: 4, fetchConcurrency: 2, realtimeFetchConcurrency: 4 }, pool).runOnce()).resolves.toMatchObject({ processed: 4, cursorHeight: 14 });
        expect(maxActiveBlockFetches).toBe(2);
    });
    it("stops later cursor advancement when an ordered block write fails", async () => {
        const blocks = new Map([11, 12, 13].map((height) => [height, rpcBlock(height)]));
        mockRpcRange(15, blocks);
        const pool = new FakeIndexerPool();
        pool.client.failProcessedBlockHeight = 12;
        await expect(new Indexer({ ...baseConfig, batchSize: 3, realtimeFetchConcurrency: 3 }, pool).runOnce()).rejects.toThrow(/boom at 12/);
        const cursorUpdates = pool.client.queries.filter((query) => query.text.includes("UPDATE indexer_cursors"));
        expect(cursorUpdates.map((query) => query.values?.[1])).toEqual([11]);
    });
    it("uses the bulk staging writer only for catchup mode when enabled", async () => {
        const blocks = new Map([[11, rpcBlock(11, [{ type: "wasm", attributes: [
                            { key: "_contract_address", value: "juno1pair" },
                            { key: "action", value: "swap" },
                            { key: "sender", value: "juno1trader" },
                            { key: "offer_asset", value: "ujuno" },
                            { key: "offer_amount", value: "1000000" },
                            { key: "ask_asset", value: "uusdc" },
                            { key: "return_amount", value: "2000000" },
                        ] }])]]);
        mockRpcRange(13, blocks);
        const pool = new FakeIndexerPool();
        await expect(new Indexer({ ...baseConfig, indexerMode: "catchup", ingestBulkStagingEnabled: true, ingestCandlesInline: false, batchSize: 1, ingestReserveSnapshotsInline: false }, pool).runOnce()).resolves.toMatchObject({ processed: 1, cursorHeight: 11 });
        expect(pool.client.queries.some((query) => query.text.includes("INSERT INTO stage_processed_blocks"))).toBe(true);
        expect(pool.client.queries.some((query) => query.text.includes("INSERT INTO swaps") && query.text.includes("FROM stage_swaps"))).toBe(true);
        const cursorUpdates = pool.client.queries.filter((query) => query.text.includes("UPDATE indexer_cursors"));
        expect(cursorUpdates.map((query) => query.values?.[1])).toEqual([11]);
    });
    it("leaves the cursor unchanged when the bulk staging merge fails", async () => {
        const blocks = new Map([[11, rpcBlock(11)]]);
        mockRpcRange(13, blocks);
        const pool = new FakeIndexerPool();
        pool.client.failStagedMerge = true;
        await expect(new Indexer({ ...baseConfig, indexerMode: "catchup", ingestBulkStagingEnabled: true, ingestCandlesInline: false, batchSize: 1 }, pool).runOnce()).rejects.toThrow(/staged merge failed/);
        expect(pool.client.queries.some((query) => query.text.includes("UPDATE indexer_cursors"))).toBe(false);
        expect(pool.client.queries.some((query) => query.text === "ROLLBACK")).toBe(true);
    });
});
describe("Indexer reserve snapshots", () => {
    it("queries pair pool state at the processed height and writes one lcd snapshot per touched pair", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
            const url = String(input);
            if (url === "https://rpc.example/status") {
                return { ok: true, json: async () => ({ result: { sync_info: { latest_block_height: "13", latest_block_hash: "head" } } }) };
            }
            if (url === "https://rpc.example/block?height=11") {
                return { ok: true, json: async () => ({ result: { block_id: { hash: "block-11" }, block: { header: { time: "2026-07-01T03:01:00Z", last_block_id: { hash: "block-10" } }, data: { txs: ["AA=="] } } } }) };
            }
            if (url === "https://rpc.example/block_results?height=11") {
                return { ok: true, json: async () => ({ result: { txs_results: [{ hash: "tx", events: [{ type: "wasm", attributes: [
                                                { key: "_contract_address", value: "juno1pair" },
                                                { key: "action", value: "swap" },
                                                { key: "sender", value: "juno1trader" },
                                                { key: "offer_asset", value: "ujuno" },
                                                { key: "offer_amount", value: "1000000" },
                                                { key: "ask_asset", value: "uusdc" },
                                                { key: "return_amount", value: "2000000" },
                                            ] }] }] } }) };
            }
            if (url.startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/")) {
                expect(init?.headers).toMatchObject({ "x-cosmos-block-height": "11" });
                return { ok: true, json: async () => ({ data: { assets: [{ info: { native_token: { denom: "ujuno" } }, amount: "123" }, { info: { native_token: { denom: "uusdc" } }, amount: "456" }], total_share: "789" } }) };
            }
            throw new Error(`unexpected fetch: ${url}`);
        });
        const pool = new FakeIndexerPool();
        await expect(new Indexer(baseConfig, pool).runOnce()).resolves.toMatchObject({ processed: 1, cursorHeight: 11 });
        const snapshot = pool.client.queries.find((query) => query.text.includes("INSERT INTO pool_state_snapshots"));
        expect(snapshot?.values).toEqual(["pool-1", 11, "2026-07-01T03:01:00Z", JSON.stringify([{ denom: "ujuno", amount: "123" }, { denom: "uusdc", amount: "456" }]), "789", "lcd"]);
        const lcdCalls = fetchSpy.mock.calls.filter(([input]) => String(input).startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/"));
        expect(lcdCalls).toHaveLength(1);
        const rangeLog = JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));
        expect(rangeLog).toMatchObject({
            msg: "indexer_range_processed",
            role: "indexer",
            rangeFrom: 11,
            rangeTo: 11,
            cursor: 11,
            head: 13,
            target: 11,
            lag: 0,
            blocks: 1,
            swaps: 1,
            liquidityEvents: 0,
            incentiveEvents: 0,
        });
        expect(rangeLog.durationMs).toEqual(expect.any(Number));
        expect(rangeLog.dbDurationMs).toEqual(expect.any(Number));
    });
    it("keeps cursor progress when LCD reserve snapshots fail", async () => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            const url = String(input);
            if (url === "https://rpc.example/status") {
                return { ok: true, json: async () => ({ result: { sync_info: { latest_block_height: "13", latest_block_hash: "head" } } }) };
            }
            if (url === "https://rpc.example/block?height=11") {
                return { ok: true, json: async () => ({ result: { block_id: { hash: "block-11" }, block: { header: { time: "2026-07-01T03:01:00Z", last_block_id: { hash: "block-10" } }, data: { txs: ["AA=="] } } } }) };
            }
            if (url === "https://rpc.example/block_results?height=11") {
                return { ok: true, json: async () => ({ result: { txs_results: [{ hash: "tx", events: [{ type: "wasm", attributes: [
                                                { key: "_contract_address", value: "juno1pair" },
                                                { key: "action", value: "swap" },
                                                { key: "sender", value: "juno1trader" },
                                                { key: "offer_asset", value: "ujuno" },
                                                { key: "offer_amount", value: "1000000" },
                                                { key: "ask_asset", value: "uusdc" },
                                                { key: "return_amount", value: "2000000" },
                                            ] }] }] } }) };
            }
            if (url.startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/")) {
                return { ok: false, status: 500, statusText: "unavailable", json: async () => ({}) };
            }
            throw new Error(`unexpected fetch: ${url}`);
        });
        const pool = new FakeIndexerPool();
        await expect(new Indexer(baseConfig, pool).runOnce()).resolves.toMatchObject({ processed: 1, cursorHeight: 11 });
        expect(pool.client.queries.some((query) => query.text.includes("UPDATE indexer_cursors"))).toBe(true);
        expect(pool.client.queries.some((query) => query.text.includes("INSERT INTO pool_state_snapshots"))).toBe(false);
        expect(fetchSpy.mock.calls.filter(([input]) => String(input).startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/"))).toHaveLength(3);
    });
    it("does not call LCD pool state when inline reserve snapshots are disabled", async () => {
        const swapEvents = [{ type: "wasm", attributes: [
                    { key: "_contract_address", value: "juno1pair" },
                    { key: "action", value: "swap" },
                    { key: "sender", value: "juno1trader" },
                    { key: "offer_asset", value: "ujuno" },
                    { key: "offer_amount", value: "1000000" },
                    { key: "ask_asset", value: "uusdc" },
                    { key: "return_amount", value: "2000000" },
                ] }];
        const blocks = new Map([[11, rpcBlock(11, swapEvents)]]);
        const fetchSpy = mockRpcRange(13, blocks);
        const pool = new FakeIndexerPool();
        await expect(new Indexer({ ...baseConfig, ingestReserveSnapshotsInline: false }, pool).runOnce()).resolves.toMatchObject({ processed: 1, cursorHeight: 11 });
        expect(pool.client.queries.some((query) => query.text.includes("INSERT INTO pool_state_snapshots"))).toBe(false);
        const jobInsert = pool.client.queries.find((query) => query.text.includes("INSERT INTO snapshot_jobs"));
        expect(jobInsert?.values).toEqual(["juno-1", ["juno1pair"], 11, "2026-07-01T03:00:11Z", "touched"]);
        expect(fetchSpy.mock.calls.some(([input]) => String(input).startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/"))).toBe(false);
    });
});
