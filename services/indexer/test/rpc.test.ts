import { afterEach, describe, expect, it, vi } from "vitest";
import { IndexerMetrics } from "../src/metrics.js";
import { JunoRestClient, JunoRpcClient } from "../src/rpc.js";

afterEach(() => vi.restoreAllMocks());

describe("JunoRestClient", () => {
  it("queries pair pool state at an explicit historical height", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          assets: [
            { info: { native_token: { denom: "ujuno" } }, amount: "123" },
            { info: { token: { contract_addr: "juno1token" } }, amount: "456" },
          ],
          total_share: "789",
        },
      }),
    } as Response);

    const state = await new JunoRestClient("https://lcd.example").poolState("juno1pair", 39381355);

    expect(state).toEqual({ reserves: [{ denom: "ujuno", amount: "123" }, { denom: "juno1token", amount: "456" }], totalShare: "789" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/^https:\/\/lcd\.example\/cosmwasm\/wasm\/v1\/contract\/juno1pair\/smart\//);
    const encoded = String(url).split("/smart/")[1] ?? "";
    expect(JSON.parse(Buffer.from(decodeURIComponent(encoded), "base64").toString("utf8"))).toEqual({ pool: {} });
    expect((init as RequestInit).headers).toMatchObject({ "x-cosmos-block-height": "39381355" });
  });

  it("rejects malformed pool responses instead of fabricating reserves", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ data: { assets: [] } }) } as Response);

    await expect(new JunoRestClient("https://lcd.example").poolState("juno1pair", 1)).rejects.toThrow(/no reserves/i);
  });
});

describe("JunoRpcClient", () => {
  it("retries transient RPC statuses and returns the successful response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(500, "Internal Server Error", {}))
      .mockResolvedValueOnce(response(429, "Too Many Requests", {}))
      .mockResolvedValueOnce(response(200, "OK", {
        result: { sync_info: { latest_block_height: "123", latest_block_hash: "ABC" } },
      }));

    const head = await new JunoRpcClient("https://rpc.example", { timeoutMs: 1_000, maxRetries: 2 }).head();

    expect(head).toEqual({ height: 123, hash: "ABC" });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      "https://rpc.example/status",
      "https://rpc.example/status",
      "https://rpc.example/status",
    ]);
  });

  it("honors timeout/retry options while recording RPC metrics", async () => {
    const metrics = new IndexerMetrics();
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(503, "Service Unavailable", {}))
      .mockResolvedValueOnce(response(200, "OK", {
        result: { sync_info: { latest_block_height: "123", latest_block_hash: "ABC" } },
      }));

    const head = await new JunoRpcClient("https://rpc.example", { timeoutMs: 1_000, maxRetries: 1, metrics }).head();

    expect(head).toEqual({ height: 123, hash: "ABC" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const snapshot = metrics.snapshot();
    expect(snapshot.rpcRequestsInFlight).toBe(0);
    expect(snapshot.rpcErrors.get("503")).toBe(1);
  });

  it("does not retry permanent RPC statuses and fails clearly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(400, "Bad Request", {}));

    await expect(new JunoRpcClient("https://rpc.example", { maxRetries: 3 }).head()).rejects.toThrow(
      "RPC /status failed: 400 Bad Request",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fails clearly after transient statuses exhaust retries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(408, "Request Timeout", {}))
      .mockResolvedValueOnce(response(503, "Service Unavailable", {}));

    await expect(new JunoRpcClient("https://rpc.example", { maxRetries: 1 }).head()).rejects.toThrow(
      "RPC /status failed: 503 Service Unavailable",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("passes an AbortController signal to RPC fetches for timeout support", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response(200, "OK", {
      result: { sync_info: { latest_block_height: "5", latest_block_hash: "HASH" } },
    }));

    await new JunoRpcClient("https://rpc.example", { timeoutMs: 50, maxRetries: 0 }).head();

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats aborted RPC requests as transient and retries", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(response(200, "OK", {
        result: { sync_info: { latest_block_height: "6", latest_block_hash: "HASH6" } },
      }));

    const head = await new JunoRpcClient("https://rpc.example", { timeoutMs: 50, maxRetries: 1 }).head();

    expect(head).toEqual({ height: 6, hash: "HASH6" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries transient failures from block result fetches", async () => {
    let blockResultsAttempts = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://rpc.example/block?height=9") return response(200, "OK", blockResponse(9));
      if (url === "https://rpc.example/block_results?height=9") {
        blockResultsAttempts += 1;
        if (blockResultsAttempts === 1) return response(503, "Service Unavailable", {});
        return response(200, "OK", { result: { txs_results: [] } });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    const block = await new JunoRpcClient("https://rpc.example", { timeoutMs: 1_000, maxRetries: 1 }).block(9);

    expect(block).toMatchObject({ height: 9, hash: "HASH9", txCount: 0, txEvents: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(blockResultsAttempts).toBe(2);
  });

  it("records fetched blocks only after both block RPC responses succeed", async () => {
    const metrics = new IndexerMetrics();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://rpc.example/block?height=9") return response(200, "OK", blockResponse(9));
      if (url === "https://rpc.example/block_results?height=9") return response(500, "Internal Server Error", {});
      throw new Error(`unexpected URL ${url}`);
    });

    await expect(new JunoRpcClient("https://rpc.example", { maxRetries: 0, metrics }).block(9)).rejects.toThrow(
      "RPC /block_results?height=9 failed: 500 Internal Server Error",
    );

    expect(metrics.snapshot().fetchBlocksTotal).toBe(0);
  });
});

function blockResponse(height: number): unknown {
  return {
    result: {
      block_id: { hash: `HASH${height}` },
      block: {
        header: { time: "2026-01-01T00:00:00Z", last_block_id: { hash: `HASH${height - 1}` } },
        data: { txs: [] },
      },
    },
  };
}

function response(status: number, statusText: string, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  } as Response;
}
