import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTRACTS, type IndexerConfig } from "../src/config.js";
import { Indexer } from "../src/indexer.js";

type Query = { text: string; values?: unknown[] };

class FakeIndexerClient {
  queries: Query[] = [];

  async query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ text, values });
    if (text.includes("RETURNING last_height")) return { rows: [{ last_height: "10" }] as T[], rowCount: 1 };
    if (text.includes("FROM processed_blocks")) return { rows: [] as T[], rowCount: 0 };
    if (text.includes("INSERT INTO processed_blocks")) return { rows: [] as T[], rowCount: 1 };
    if (text.includes("INSERT INTO swaps")) return { rows: [{ id: "swap-1", pool_id: "pool-1" }] as T[], rowCount: 1 };
    if (text.includes("FROM asset_metadata")) return { rows: [{ asset: "ujuno", decimals: 6 }, { asset: "uusdc", decimals: 6 }] as T[], rowCount: 2 };
    if (text.includes("FROM pools") && text.includes("ANY($2::text[])")) {
      const requested = new Set((values?.[1] as string[]) ?? []);
      const rows = ["juno1pair"].filter((pair) => requested.has(pair)).map((pair_address) => ({ pair_address }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (text.includes("FROM pools") && text.includes("pair_address")) return { rows: [{ id: "pool-1", pair_address: "juno1pair" }] as T[], rowCount: 1 };
    if (text.includes("INSERT INTO token_candles")) return { rows: [] as T[], rowCount: 1 };
    if (text.includes("INSERT INTO pool_state_snapshots")) return { rows: [] as T[], rowCount: 1 };
    if (text.includes("UPDATE indexer_cursors")) return { rows: [] as T[], rowCount: 1 };
    return { rows: [] as T[], rowCount: 0 };
  }

  release() {}
}

class FakeIndexerPool {
  readonly client = new FakeIndexerClient();
  async connect() { return this.client; }
}

const baseConfig: IndexerConfig = {
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
  priceProviderName: "provider",
  priceCacheTtlMs: 300_000,
  priceStaleAfterMs: 1_800_000,
  priceAllowStale: true,
  priceDevMocks: false,
  apiPort: 8787,
};

afterEach(() => vi.restoreAllMocks());

describe("Indexer reserve snapshots", () => {
  it("queries pair pool state at the processed height and writes one lcd snapshot per touched pair", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://rpc.example/status") {
        return { ok: true, json: async () => ({ result: { sync_info: { latest_block_height: "13", latest_block_hash: "head" } } }) } as Response;
      }
      if (url === "https://rpc.example/block?height=11") {
        return { ok: true, json: async () => ({ result: { block_id: { hash: "block-11" }, block: { header: { time: "2026-07-01T03:01:00Z", last_block_id: { hash: "block-10" } }, data: { txs: ["AA=="] } } } }) } as Response;
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
        ] }] }] } }) } as Response;
      }
      if (url.startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/")) {
        expect((init as RequestInit | undefined)?.headers).toMatchObject({ "x-cosmos-block-height": "11" });
        return { ok: true, json: async () => ({ data: { assets: [{ info: { native_token: { denom: "ujuno" } }, amount: "123" }, { info: { native_token: { denom: "uusdc" } }, amount: "456" }], total_share: "789" } }) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const pool = new FakeIndexerPool();

    await expect(new Indexer(baseConfig, pool as never).runOnce()).resolves.toMatchObject({ processed: 1, cursorHeight: 11 });

    const snapshot = pool.client.queries.find((query) => query.text.includes("INSERT INTO pool_state_snapshots"));
    expect(snapshot?.values).toEqual(["pool-1", 11, "2026-07-01T03:01:00Z", JSON.stringify([{ denom: "ujuno", amount: "123" }, { denom: "uusdc", amount: "456" }]), "789", "lcd"]);
    const lcdCalls = fetchSpy.mock.calls.filter(([input]) => String(input).startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/"));
    expect(lcdCalls).toHaveLength(1);
  });

  it("keeps cursor progress when LCD reserve snapshots fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://rpc.example/status") {
        return { ok: true, json: async () => ({ result: { sync_info: { latest_block_height: "13", latest_block_hash: "head" } } }) } as Response;
      }
      if (url === "https://rpc.example/block?height=11") {
        return { ok: true, json: async () => ({ result: { block_id: { hash: "block-11" }, block: { header: { time: "2026-07-01T03:01:00Z", last_block_id: { hash: "block-10" } }, data: { txs: ["AA=="] } } } }) } as Response;
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
        ] }] }] } }) } as Response;
      }
      if (url.startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/")) {
        return { ok: false, status: 500, statusText: "unavailable", json: async () => ({}) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const pool = new FakeIndexerPool();

    await expect(new Indexer(baseConfig, pool as never).runOnce()).resolves.toMatchObject({ processed: 1, cursorHeight: 11 });

    expect(pool.client.queries.some((query) => query.text.includes("UPDATE indexer_cursors"))).toBe(true);
    expect(pool.client.queries.some((query) => query.text.includes("INSERT INTO pool_state_snapshots"))).toBe(false);
    expect(fetchSpy.mock.calls.filter(([input]) => String(input).startsWith("https://lcd.example/cosmwasm/wasm/v1/contract/juno1pair/smart/"))).toHaveLength(3);
  });
});
