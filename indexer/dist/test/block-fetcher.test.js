import { describe, expect, it } from "vitest";
import { fetchBlockRange } from "../src/block-fetcher.js";
function bundle(height) {
    return { height, hash: `hash-${height}`, time: "2026-01-01T00:00:00Z", txCount: 0, txEvents: [] };
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
describe("fetchBlockRange", () => {
    it("caps in-flight block fetches at the requested concurrency", async () => {
        let active = 0;
        let maxActive = 0;
        const rpc = {
            async block(height) {
                active += 1;
                maxActive = Math.max(maxActive, active);
                await sleep(5);
                active -= 1;
                return bundle(height);
            },
        };
        const blocks = await fetchBlockRange({ rpc, from: 10, to: 16, concurrency: 3 });
        expect(maxActive).toBe(3);
        expect(blocks.map((block) => block.height)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    });
    it("returns bundles sorted by ascending height when requests resolve out of order", async () => {
        const rpc = {
            async block(height) {
                await sleep((5 - height) * 5);
                return bundle(height);
            },
        };
        const blocks = await fetchBlockRange({ rpc, from: 1, to: 4, concurrency: 4 });
        expect(blocks.map((block) => block.height)).toEqual([1, 2, 3, 4]);
    });
    it("fails the whole range with the exhausted height when one block fetch fails", async () => {
        const rpc = {
            async block(height) {
                if (height === 3)
                    throw new Error("RPC /block?height=3 failed: 503 Service Unavailable");
                return bundle(height);
            },
        };
        await expect(fetchBlockRange({ rpc, from: 1, to: 5, concurrency: 2 })).rejects.toThrow(/failed to fetch block 3: RPC \/block\?height=3 failed: 503 Service Unavailable/);
    });
    it("stops scheduling new heights after a worker fails", async () => {
        const calls = [];
        const rpc = {
            async block(height) {
                calls.push(height);
                if (height === 1) {
                    await sleep(20);
                    return bundle(height);
                }
                if (height === 2)
                    throw new Error("boom");
                return bundle(height);
            },
        };
        await expect(fetchBlockRange({ rpc, from: 1, to: 5, concurrency: 2 })).rejects.toThrow(/failed to fetch block 2: boom/);
        expect(calls).toEqual([1, 2]);
    });
    it("rejects invalid concurrency clearly", async () => {
        const rpc = { block: async (height) => bundle(height) };
        await expect(fetchBlockRange({ rpc, from: 1, to: 1, concurrency: 0 })).rejects.toThrow(/concurrency/i);
    });
});
