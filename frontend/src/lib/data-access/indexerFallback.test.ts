import { describe, expect, it, vi, beforeEach } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { loadPoolMetrics, loadStatsDashboard, loadWalletIndexerData, resetIndexerCircuitBreakerForTests, type IndexerRuntimeConfig } from "./indexerFallback";

const pool = { id: "juno-usdc", label: "JUNO / USDC", pair: "juno1pool", lpToken: "factory/lp", type: "xyk", feeBps: 30, assets: [], enabled: true, verified: true, source: "registry" } as unknown as RegistryPool;

function config(overrides: Partial<IndexerRuntimeConfig> = {}): IndexerRuntimeConfig {
  return { baseUrl: "https://indexer.example", disabled: false, timeoutMs: 50, retry: 0, staleAfterMs: 60_000, circuitBreakerMs: 1_000, ...overrides };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

describe("indexer fallback data access", () => {
  beforeEach(() => {
    resetIndexerCircuitBreakerForTests();
    vi.restoreAllMocks();
  });

  it("prefers successful indexer pool metrics and preserves source labels", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) return json({ status: "ok", service: "dex-indexer", dataSource: "indexer", isMock: false });
      return json({ data: [{ pair: pool.pair, tvlUsd: 1234, volume24hUsd: 55, totalApr: 7, incentivized: true, updatedAt: new Date().toISOString(), dataSource: "indexer", isMock: false }], pagination: { limit: 50, nextCursor: null } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);

    const result = await loadPoolMetrics([pool], config());

    expect(result.state.source).toBe("indexer");
    expect(result.data[pool.pair]).toMatchObject({ tvlUsd: 1234, volume24hUsd: 55, totalApr: 7, source: "indexer" });
  });

  it("falls back gracefully when indexer health fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ status: "down" }, 503)));

    const result = await loadPoolMetrics([pool], config());

    expect(result.data).toEqual({});
    expect(result.state).toMatchObject({ source: "fallback", isFallback: true });
    expect(result.state.error?.code).toBe("http");
  });

  it("falls back gracefully on indexer timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));

    const result = await loadPoolMetrics([pool], config({ timeoutMs: 1 }));

    expect(result.data).toEqual({});
    expect(result.state.error?.code).toBe("timeout");
  });

  it("treats empty production responses as unavailable instead of fake zeros", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/health")
      ? json({ status: "ok", service: "dex-indexer", dataSource: "indexer", isMock: false })
      : json({ data: [], pagination: { limit: 50, nextCursor: null } }));
    vi.stubGlobal("fetch", fetcher);

    const result = await loadPoolMetrics([pool], config());

    expect(result.data).toEqual({});
    expect(result.state.error?.code).toBe("empty");
    expect(result.state.source).toBe("fallback");
  });

  it("labels mock and stale indexer metrics", async () => {
    const staleDate = new Date(Date.now() - 10_000).toISOString();
    const fetcher = vi.fn(async (url: string) => url.endsWith("/health")
      ? json({ status: "ok", service: "dex-indexer", dataSource: "mock", isMock: true })
      : json({ data: [{ pair: pool.pair, tvlUsd: 1, updatedAt: staleDate, dataSource: "mock", isMock: true }], pagination: { limit: 50, nextCursor: null } }));
    vi.stubGlobal("fetch", fetcher);

    const result = await loadPoolMetrics([pool], config({ staleAfterMs: 1 }));

    expect(result.state).toMatchObject({ source: "mock", isMock: true, isStale: true });
    expect(result.data[pool.pair]).toMatchObject({ source: "mock", isMock: true, isStale: true });
  });

  it("loads indexed wallet positions and transaction history without falling back", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) return json({ status: "ok", service: "dex-indexer", dataSource: "indexer", isMock: false });
      if (url.includes("/positions")) return json({ data: [], pagination: { limit: 100, nextCursor: null } });
      return json({ data: [{ txHash: "ABC", walletAddress: "juno1wallet", poolId: "juno-usdc", pairAddress: pool.pair, type: "swap", height: 10, timestamp: new Date().toISOString(), offerAsset: { denom: "ujuno", symbol: "JUNO", amount: "1" }, askAsset: { denom: "ibc/usdc", symbol: "USDC", amount: "2" }, amountUsd: 2, feeUsd: 0.01, success: true, dataSource: "indexer", isMock: false }], pagination: { limit: 50, nextCursor: null } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);

    const result = await loadWalletIndexerData("juno1wallet", config());

    expect(result.state).toMatchObject({ source: "indexer", isFallback: false });
    expect(result.data.history).toHaveLength(1);
    expect(result.data.history[0]).toMatchObject({ type: "swap", txHash: "ABC", pairAddress: pool.pair });
  });

  it("keeps empty wallet history empty instead of generating fake activity", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/health")
      ? json({ status: "ok", service: "dex-indexer", dataSource: "indexer", isMock: false })
      : json({ data: [], pagination: { limit: 100, nextCursor: null } }));
    vi.stubGlobal("fetch", fetcher);

    const result = await loadWalletIndexerData("juno1wallet", config());

    expect(result.state).toMatchObject({ source: "indexer", isFallback: false });
    expect(result.data.history).toEqual([]);
    expect(result.data.positions).toEqual([]);
  });

  it("falls back to empty wallet history when the indexer wallet endpoint fails", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) return json({ status: "ok", service: "dex-indexer", dataSource: "indexer", isMock: false });
      if (url.includes("/history")) return json({ error: "down" }, 500);
      return json({ data: [], pagination: { limit: 100, nextCursor: null } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);

    const result = await loadWalletIndexerData("juno1wallet", config());

    expect(result.data).toEqual({ positions: [], history: [] });
    expect(result.state).toMatchObject({ source: "fallback", isFallback: true });
    expect(result.state.error?.code).toBe("http");
  });

  it("loads protocol stats and top pools from the indexer", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) return json({ status: "ok", service: "dex-indexer", dataSource: "indexer", isMock: false });
      if (url.endsWith("/stats")) return json({ poolCount: 3, tvlUsd: 1234567, volume24hUsd: 45000, fees24hUsd: 135, incentivizedPools: 1, updatedAt: new Date().toISOString(), dataSource: "indexer", isMock: false });
      return json({ data: [{ id: "juno-usdc", pair: pool.pair, tvlUsd: 1234567, volume24hUsd: 45000, totalApr: 12.5, fees24hUsd: 135, updatedAt: new Date().toISOString(), dataSource: "indexer", isMock: false }], pagination: { limit: 10, nextCursor: null } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);

    const result = await loadStatsDashboard([pool], config());

    expect(result.state).toMatchObject({ source: "indexer", isFallback: false });
    expect(result.data.stats).toMatchObject({ poolCount: 3, tvlUsd: 1234567, fees24hUsd: 135 });
    expect(result.data.topPools[0]).toMatchObject({ label: "JUNO / USDC", pair: pool.pair, totalApr: 12.5 });
  });

  it("keeps stats empty when the indexer has no protocol or pool metrics", async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) return json({ status: "ok", service: "dex-indexer", dataSource: "indexer", isMock: false });
      if (url.endsWith("/stats")) return json({ updatedAt: new Date().toISOString(), dataSource: "indexer", isMock: false });
      return json({ data: [], pagination: { limit: 10, nextCursor: null } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);

    const result = await loadStatsDashboard([pool], config());

    expect(result.data).toEqual({ topPools: [] });
    expect(result.state).toMatchObject({ source: "fallback", isFallback: true });
    expect(result.state.error?.code).toBe("empty");
  });

  it("labels mock and stale stats dashboard data", async () => {
    const staleDate = new Date(Date.now() - 10_000).toISOString();
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) return json({ status: "ok", service: "dex-indexer", dataSource: "mock", isMock: true });
      if (url.endsWith("/stats")) return json({ poolCount: 1, tvlUsd: 10, updatedAt: staleDate, dataSource: "mock", isMock: true });
      return json({ data: [{ pair: pool.pair, tvlUsd: 10, updatedAt: staleDate, dataSource: "mock", isMock: true }], pagination: { limit: 10, nextCursor: null } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetcher);

    const result = await loadStatsDashboard([pool], config({ staleAfterMs: 1 }));

    expect(result.state).toMatchObject({ source: "mock", isMock: true, isStale: true });
    expect(result.data.stats).toMatchObject({ source: "mock", isMock: true, isStale: true });
    expect(result.data.topPools[0]).toMatchObject({ source: "mock", isMock: true, isStale: true });
  });
});
