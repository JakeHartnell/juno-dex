import { afterEach, describe, expect, it } from "vitest";
import type http from "node:http";
import { createIndexerApi } from "../src/api.js";
import { PostgresApiStore } from "../src/api-store.js";

type QueryCall = { text: string; values?: unknown[] };

class FakeDb {
  calls: QueryCall[] = [];
  async query(text: string, values?: unknown[]) {
    this.calls.push({ text, values });
    if (text === "SELECT 1") return { rows: [{ "?column?": 1 }] };
    if (text.includes("FROM schema_migrations")) return { rows: [{ count: 3 }] };
    if (text.includes("FROM indexer_cursors")) return { rows: [{ last_height: "42", updated_at: "2026-07-03T00:00:00.000Z" }] };
    if (text.includes("pool_count") && text.includes("latest_pool_states")) return { rows: [{ pool_count: 1, incentivized_pools: 1, updated_at: "2026-07-03T00:00:00.000Z", tvl_usd: null, tvl_juno: "1000", volume_24h_usd: null, volume_24h_juno: "25", volume_7d_usd: null, volume_7d_juno: "100", fees_24h_usd: null, fees_24h_juno: "0.3" }] };
    if (text.includes("FROM token_prices")) return { rows: [{ asset: "ujuno", price_usd: null, price_juno: "1", source: "pool", status: "fresh", observed_at: "2026-07-03T00:00:00.000Z" }] };
    if (text.includes("FROM pools p") && text.includes("LIMIT 1")) {
      return { rows: [poolRow()] };
    }
    if (text.includes("FROM pools p")) return { rows: [poolRow()] };
    if (text.includes("FROM token_candles")) {
      return { rows: [{ pool_id: "pool-1", pair_address: "juno1pair", asset: "ujuno", quote_asset: "uusdc", interval: "1h", bucket_start: "2026-07-03T00:00:00.000Z", open: "1", high: "1.2", low: "0.9", close: "1.1", volume: "10", volume_quote: "11", trade_count: 2 }] };
    }
    if (text.includes("FROM positions")) return { rows: [] };
    if (text.includes("FROM liquidity_events")) return { rows: [] };
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
  if (openServer) await new Promise<void>((resolve, reject) => openServer!.close((error) => (error ? reject(error) : resolve())));
  openServer = undefined;
});

describe("production API", () => {
  it("serves health, readiness, stats and OpenAPI without mock markers", async () => {
    const { server, baseUrl } = await start();
    openServer = server;
    const health = await (await fetch(`${baseUrl}/health`)).json();
    expect(health).toMatchObject({ status: "ok", service: "astroport-juno-indexer", dataSource: "indexer", isMock: false, cursorHeight: 42 });
    const ready = await (await fetch(`${baseUrl}/ready`)).json();
    expect(ready).toMatchObject({ status: "ready", database: "ok", migrationsApplied: 3, checks: { database: true, migrations: true, rpc: true } });
    const stats = await (await fetch(`${baseUrl}/stats`)).json();
    expect(stats).toMatchObject({ poolCount: 1, tvlUsd: null, tvlJuno: 1000, volume24hUsd: null, volume24hJuno: 25, incentivizedPools: 1, isMock: false });
    const openapi = await (await fetch(`${baseUrl}/openapi.json`)).json();
    expect(openapi.paths["/ready"]).toBeTruthy();
  });

  it("returns frontend-compatible pool, price and candle responses from Postgres rows", async () => {
    const { server, baseUrl } = await start();
    openServer = server;
    const pools = await (await fetch(`${baseUrl}/pools`)).json();
    expect(pools.data[0]).toMatchObject({ id: "pool-1", pairAddress: "juno1pair", tvlUsd: null, tvlJuno: 1000, isMock: false });
    expect(pools.data[0].assets[0]).toMatchObject({ denom: "ujuno", priceJuno: null, priceStatus: "missing" });

    const price = await (await fetch(`${baseUrl}/prices/ujuno`)).json();
    expect(price).toMatchObject({ asset: "ujuno", priceUsd: null, priceJuno: 1, source: "pool", status: "fresh", isMock: false });

    const candles = await (await fetch(`${baseUrl}/pools/juno1pair/candles?interval=1h&limit=999`)).json();
    expect(candles.pagination.limit).toBe(500);
    expect(candles.meta).toMatchObject({ pairAddress: "juno1pair", dataSource: "indexer", isMock: false });
    expect(candles.data[0]).toMatchObject({ baseAsset: "ujuno", quoteAsset: "uusdc", close: 1.1, volumeQuote: 11 });
  });


  it("returns HTTP 503 when readiness checks report not_ready", async () => {
    const db = new FakeDb();
    const store = new PostgresApiStore(db as never, "juno-1", "cursor", { expectedMigrationCount: 4 });
    const server = createIndexerApi(store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    openServer = server;
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");

    const response = await fetch(`http://127.0.0.1:${address.port}/ready`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "not_ready", checks: { migrations: false } });
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
