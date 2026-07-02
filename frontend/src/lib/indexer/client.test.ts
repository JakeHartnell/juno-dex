import { describe, expect, it, vi } from "vitest";
import { createIndexerClient } from "./client";

describe("indexer typed client", () => {
  it("fetches paginated pool metrics from /pools", async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ data: [], pagination: { limit: 10, nextCursor: null } }), { status: 200 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example/", fetcher });
    const pools = await client.pools({ limit: 10 });
    expect(fetcher).toHaveBeenCalledWith("https://indexer.example/pools?limit=10");
    expect(pools.pagination.limit).toBe(10);
  });

  it("throws on unavailable indexer responses", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    const client = createIndexerClient({ baseUrl: "https://indexer.example", fetcher });
    await expect(client.health()).rejects.toThrow("Indexer request failed: 503");
  });
});
