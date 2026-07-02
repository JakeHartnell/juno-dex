import { describe, expect, it, vi } from "vitest";
import { createIndexerClient } from "./client";

describe("indexer typed client", () => {
  it("fetches paginated pool metrics from /pools", async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ data: [], pagination: { limit: 10, nextCursor: null } }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example/", fetcher });
    const pools = await client.pools({ limit: 10 });
    expect(fetcher).toHaveBeenCalledWith("https://indexer.example/pools?limit=10", undefined);
    expect(pools.pagination.limit).toBe(10);
  });

  it("fetches USD prices from /prices", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ asset: "ujuno", priceUsd: 1.25, source: "stored", status: "fresh", stale: false, observedAt: "2026-07-02T00:00:00.000Z", ageMs: 0, isMock: false }] }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example/", fetcher });
    const prices = await client.prices(["ujuno", "ibc/mock"]);
    expect(fetcher).toHaveBeenCalledWith("https://indexer.example/prices?assets=ujuno%2Cibc%2Fmock", undefined);
    expect(prices.data[0].priceUsd).toBe(1.25);
  });

  it("throws on unavailable indexer responses", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example", fetcher });
    await expect(client.health()).rejects.toThrow("Indexer request failed: 503");
  });
});
