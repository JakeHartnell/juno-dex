import { afterEach, describe, expect, it, vi } from "vitest";
import type http from "node:http";
import { createIndexerApi } from "../src/api.js";
import { PostgresApiStore } from "../src/api-store.js";

type QueryCall = { text: string; values?: unknown[] };

class FakeDb {
  calls: QueryCall[] = [];
  async query(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    if (text === "SELECT 1") return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM schema_migrations")) return { rows: [{ version: "001_init.sql" }, { version: "002_pool_candles.sql" }, { version: "003_api_pricing_readiness.sql" }] };
    if (text.includes("FROM indexer_cursors")) return { rows: [{ last_height: "42", updated_at: "2026-07-03T00:00:00.000Z" }] };
    if (text.includes("FROM protocol_stats_latest")) return { rows: [{ pool_count: 1, incentivized_pools: 1, updated_at: "2026-07-03T00:00:00.000Z", tvl_usd: null, tvl_juno: "1000", volume_24h_usd: null, volume_24h_juno: "25", volume_7d_usd: null, volume_7d_juno: "100", fees_24h_usd: null, fees_24h_juno: "0.3" }] };
    if (text.includes("FROM token_prices")) return { rows: [{ asset: "ujuno", price_usd: null, price_juno: "1", source: "pool", status: "fresh", observed_at: "2026-07-03T00:00:00.000Z" }] };
    if (text.includes("FROM latest_pool_state") && text.includes("LIMIT 1")) {
      return { rows: [poolRow()] };
    }
    if (text.includes("FROM latest_pool_state")) return { rows: [poolRow()] };
    if (text.includes("FROM pools p") && text.includes("LIMIT 1")) return { rows: [poolRow()] };
    if (text.includes("FROM pools p")) return { rows: [poolRow()] };
    if (text.includes("FROM pool_candle_buckets")) {
      return { rows: [{ pool_id: "pool-1", pair_address: "juno1pair", asset: "ujuno", quote_asset: "uusdc", interval: "1h", bucket_start: "2026-07-03T00:00:00.000Z", open: "1", high: "1.2", low: "0.9", close: "1.1", volume: "10", volume_quote: "11", trade_count: 2 }] };
    }
    if (text.includes("FROM wallet_position_latest")) return { rows: [{ wallet_address: "juno1wallet", owner_address: "juno1wallet", pool_id: "pool-1", pair_address: "juno1pair", lp_token_address: "factory/juno1pair/astroport/share", lp_balance: "7", bonded_balance: "2", updated_at: "2026-07-03T00:00:00.000Z" }] };
    if (text.includes("FROM wallet_history_flat")) return { rows: [{ tx_hash: "tx-1", wallet_address: "juno1wallet", pair_address: "juno1pair", type: "swap", height: "42", timestamp: "2026-07-03T00:00:00.000Z", offer_asset: { denom: "ujuno", amount: "1" }, ask_asset: { denom: "uusdc", amount: "2" }, amount_usd: null, fee_usd: null, success: true }] };
    throw new Error(`unexpected query: ${text}`);
  }
}

class EmptyReadModelDb {
  calls: QueryCall[] = [];
  async query(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    if (text === "SELECT 1") return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM schema_migrations")) return { rows: [{ version: "001_init.sql" }, { version: "002_pool_candles.sql" }, { version: "003_api_pricing_readiness.sql" }] };
    if (text.includes("FROM indexer_cursors")) return { rows: [] };
    if (text.includes("FROM protocol_stats_latest")) return { rows: [] };
    if (text.includes("FROM latest_pool_state")) return { rows: [] };
    if (text.includes("FROM pools p")) return { rows: [] };
    if (text.includes("FROM pool_candle_buckets")) return { rows: [] };
    if (text.includes("FROM wallet_position_latest")) return { rows: [] };
    if (text.includes("FROM wallet_history_flat")) return { rows: [] };
    throw new Error(`unexpected query: ${text}`);
  }
}

function poolRow() {
  return {
    id: "pool-1",
    chain_id: "juno-1",
    pair_address: "juno1pair",
    liquidity_token_address: "factory/juno1pair/astroport/share",
    pool_type: "xyk",
    asset_infos: [{ native_token: { denom: "ujuno" } }, { native_token: { denom: "uusdc" } }],
    tvl_usd: null,
    tvl_juno: "1000",
    total_share: "789",
    reserves: [{ denom: "ujuno", amount: "123" }, { denom: "uusdc", amount: "456" }],
    updated_at: "2026-07-03T00:00:00.000Z",
  };
}

async function start(db = new FakeDb()) {
  const store = new PostgresApiStore(db as never, "juno-1", "cursor");
  const server = createIndexerApi(store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  return { db, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

let openServer: http.Server | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  if (openServer) await new Promise<void>((resolve, reject) => openServer!.close((error) => (error ? reject(error) : resolve())));
  openServer = undefined;
});

describe("production API", () => {
  it("serves health, readiness, stats and OpenAPI without mock markers", async () => {
    const { server, baseUrl } = await start();
    openServer = server;
    const health = await (await fetch(`${baseUrl}/health`)).json();
    expect(health).toMatchObject({ status: "ok", service: "astroport-juno-indexer", dataSource: "indexer", isMock: false, confirmationDepth: 0, cursorHeight: 42, confirmedTargetHeight: null, confirmedLag: null, rpcConfigured: false, rpcReachable: false });
    const ready = await (await fetch(`${baseUrl}/ready`)).json();
    expect(ready).toMatchObject({ status: "ready", database: "ok", migrationsApplied: 3, checks: { database: true, migrations: true, rpc: true } });
    const stats = await (await fetch(`${baseUrl}/stats`)).json();
    expect(stats).toMatchObject({ poolCount: 1, tvlUsd: null, tvlJuno: 1000, volume24hUsd: null, volume24hJuno: 25, incentivizedPools: 1, isMock: false });
    const openapi = await (await fetch(`${baseUrl}/openapi.json`)).json();
    expect(openapi.paths["/ready"]).toBeTruthy();
    expect(openapi.paths["/metrics"]).toBeTruthy();
  });

  it("serves Prometheus metrics for readiness, cursor, RPC, and migrations", async () => {
    const { server, baseUrl } = await start();
    openServer = server;

    const response = await fetch(`${baseUrl}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.text();
    expect(body).toContain("# HELP juno_indexer_ready");
    expect(body).toContain('juno_indexer_ready{chain_id="juno-1"} 1');
    expect(body).toContain('juno_indexer_rpc_configured{chain_id="juno-1"} 0');
    expect(body).toContain('juno_indexer_rpc_reachable{chain_id="juno-1"} 0');
    expect(body).toContain('juno_indexer_cursor_height{chain_id="juno-1"} 42');
    expect(body).toContain('juno_indexer_cursor_age_ms{chain_id="juno-1"}');
    expect(body).toContain('juno_indexer_migrations_applied{chain_id="juno-1"} 3');
  });

  it("uses one shared RPC head check per metrics scrape", async () => {
    const originalFetch = globalThis.fetch.bind(globalThis);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "http://rpc.example/status") {
        return {
          ok: true,
          json: async () => ({ result: { sync_info: { latest_block_height: "50", latest_block_hash: "head-hash" } } }),
        } as Response;
      }
      return originalFetch(input, init);
    });
    const store = new PostgresApiStore(new FakeDb() as never, "juno-1", "cursor", { rpcUrl: "http://rpc.example", confirmationDepth: 2 });
    const server = createIndexerApi(store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    openServer = server;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");

    const body = await (await fetch(`http://127.0.0.1:${address.port}/metrics`)).text();

    const rpcCalls = fetchSpy.mock.calls.filter(([input]) => String(input) === "http://rpc.example/status");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]?.[0]).toBe("http://rpc.example/status");
    expect(body).toContain('juno_indexer_rpc_configured{chain_id="juno-1"} 1');
    expect(body).toContain('juno_indexer_rpc_reachable{chain_id="juno-1"} 1');
    expect(body).toContain('juno_indexer_head_height{chain_id="juno-1"} 50');
    expect(body).toContain('juno_indexer_confirmed_target_height{chain_id="juno-1"} 48');
    expect(body).toContain('juno_indexer_confirmed_lag_blocks{chain_id="juno-1"} 6');
  });

  it("returns frontend-compatible pool, price and candle responses from Postgres rows", async () => {
    const { db, server, baseUrl } = await start();
    openServer = server;
    const pools = await (await fetch(`${baseUrl}/pools`)).json();
    expect(pools.data[0]).toMatchObject({ id: "pool-1", pairAddress: "juno1pair", tvlUsd: null, tvlJuno: 1000, totalShare: "789", isMock: false });
    expect(pools.data[0].assets[0]).toMatchObject({ denom: "ujuno", reserve: "123", priceJuno: null, priceStatus: "missing" });
    expect(pools.data[0].assets[1]).toMatchObject({ denom: "uusdc", reserve: "456" });

    const poolDetail = await (await fetch(`${baseUrl}/pools/juno1pair`)).json();
    expect(poolDetail).toMatchObject({ id: "pool-1", pairAddress: "juno1pair", totalShare: "789", isMock: false });
    expect(poolDetail.assets[0]).toMatchObject({ denom: "ujuno", reserve: "123" });
    expect(poolDetail.assets[1]).toMatchObject({ denom: "uusdc", reserve: "456" });

    const price = await (await fetch(`${baseUrl}/prices/ujuno`)).json();
    expect(price).toMatchObject({ asset: "ujuno", priceUsd: null, priceJuno: 1, source: "pool", status: "fresh", isMock: false });

    const candles = await (await fetch(`${baseUrl}/pools/juno1pair/candles?interval=1h&limit=999`)).json();
    expect(candles.pagination.limit).toBe(500);
    expect(candles.meta).toMatchObject({ pairAddress: "juno1pair", dataSource: "indexer", isMock: false });
    expect(candles.data[0]).toMatchObject({ baseAsset: "ujuno", quoteAsset: "uusdc", close: 1.1, volumeQuote: 11 });
    expect(db.calls.some((call) => call.text.includes("FROM latest_pool_state"))).toBe(true);
    expect(db.calls.some((call) => call.text.includes("FROM pool_candle_buckets"))).toBe(true);
    expect(db.calls.some((call) => call.text.includes("FROM token_candles"))).toBe(false);
  });

  it("serves wallet history and positions from read models", async () => {
    const { db, server, baseUrl } = await start();
    openServer = server;

    const history = await (await fetch(`${baseUrl}/wallets/juno1wallet/history`)).json();
    expect(history.data[0]).toMatchObject({ txHash: "tx-1", walletAddress: "juno1wallet", pairAddress: "juno1pair", type: "swap", height: 42, isMock: false });
    expect(history.data[0].offerAsset).toEqual({ denom: "ujuno", amount: "1" });

    const positions = await (await fetch(`${baseUrl}/wallets/juno1wallet/positions`)).json();
    expect(positions.data[0]).toMatchObject({ walletAddress: "juno1wallet", poolId: "pool-1", pairAddress: "juno1pair", lpBalance: "7", bondedBalance: "2" });
    expect(db.calls.some((call) => call.text.includes("FROM wallet_history_flat"))).toBe(true);
    expect(db.calls.some((call) => call.text.includes("FROM wallet_position_latest"))).toBe(true);
    expect(db.calls.some((call) => call.text.includes("FROM swaps"))).toBe(false);
    expect(db.calls.some((call) => call.text.includes("FROM positions"))).toBe(false);
  });

  it("returns honest empty API responses when read models have no production rows", async () => {
    const { db, server, baseUrl } = await start(new EmptyReadModelDb() as never);
    openServer = server;

    const stats = await (await fetch(`${baseUrl}/stats`)).json();
    expect(stats).toMatchObject({ poolCount: 0, tvlUsd: null, tvlJuno: null, incentivizedPools: 0, isMock: false });

    const pools = await (await fetch(`${baseUrl}/pools`)).json();
    expect(pools).toMatchObject({ data: [], pagination: { limit: 50, nextCursor: null } });

    const history = await (await fetch(`${baseUrl}/wallets/juno1empty/history`)).json();
    expect(history).toMatchObject({ data: [], pagination: { limit: 50, nextCursor: null } });

    const positions = await (await fetch(`${baseUrl}/wallets/juno1empty/positions`)).json();
    expect(positions).toMatchObject({ data: [], pagination: { limit: 50, nextCursor: null } });

    const poolDetail = await fetch(`${baseUrl}/pools/juno1missing`);
    expect(poolDetail.status).toBe(404);
    expect(db.calls.some((call) => call.text.includes("FROM protocol_stats_latest"))).toBe(true);
    expect(db.calls.some((call) => call.text.includes("FROM latest_pool_state"))).toBe(true);
  });

  it("returns HTTP 503 when readiness checks report not_ready", async () => {
    const db = new FakeDb();
    const store = new PostgresApiStore(db as never, "juno-1", "cursor", { expectedMigrationVersions: ["001_init.sql", "002_pool_candles.sql", "003_api_pricing_readiness.sql", "004_pool_state_source_precedence.sql"] });
    const server = createIndexerApi(store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    openServer = server;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");

    const response = await fetch(`http://127.0.0.1:${address.port}/ready`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "not_ready", checks: { migrations: false }, missingMigrations: ["004_pool_state_source_precedence.sql"] });
  });

  it("returns structured errors without leaking database internals", async () => {
    const db = { query: async () => { throw new Error("secret database internals"); } };
    const { server, baseUrl } = await start(db as never);
    openServer = server;
    const response = await fetch(`${baseUrl}/stats`);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "internal_error" });
  });
});
