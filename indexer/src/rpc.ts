import { createHash } from "node:crypto";
import type { TendermintEvent } from "./events.js";
import type { IndexerMetrics } from "./metrics.js";

export type ChainHead = { height: number; hash: string };
export type BlockBundle = {
  height: number;
  hash: string;
  parentHash?: string;
  time: string;
  txCount: number;
  txEvents: Array<{ txHash: string; events: TendermintEvent[] }>;
};
export type PoolState = {
  reserves: Array<{ denom: string; amount: string }>;
  totalShare: string | null;
};

type Json = Record<string, unknown>;

export class JunoRestClient {
  constructor(private readonly restUrl: string, private readonly timeoutMs = 5_000, private readonly maxRetries = 2) {}

  async poolState(pairAddress: string, height?: number): Promise<PoolState> {
    const encodedQuery = encodeURIComponent(Buffer.from(JSON.stringify({ pool: {} })).toString("base64"));
    const headers: Record<string, string> = {};
    if (height !== undefined) headers["x-cosmos-block-height"] = String(height);
    const path = `/cosmwasm/wasm/v1/contract/${pairAddress}/smart/${encodedQuery}`;
    const json = await this.getJson(path, headers);
    return normalizePoolState(json.data ?? json);
  }

  private async getJson(path: string, headers: Record<string, string>): Promise<Json> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.restUrl}${path}`, { headers, signal: controller.signal });
        if (response.ok) return await response.json() as Json;
        if (!isTransientStatus(response.status) || attempt === this.maxRetries) {
          throw new Error(`LCD smart query failed: ${response.status} ${response.statusText}`);
        }
        lastError = new Error(`LCD smart query failed: ${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries || !isTransientFetchError(error)) throw error;
      } finally {
        clearTimeout(timeout);
      }
      await delay(100 * 2 ** attempt);
    }
    throw lastError instanceof Error ? lastError : new Error("LCD smart query failed");
  }
}

export class JunoRpcClient {
  private readonly metrics?: IndexerMetrics;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly rpcUrl: string, options: { metrics?: IndexerMetrics; timeoutMs?: number; maxRetries?: number } = {}) {
    this.metrics = options.metrics;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 5;
  }

  async head(): Promise<ChainHead> {
    const json = await this.get("/status") as Json;
    const latest = (((json.result as Json).sync_info as Json));
    return { height: Number(latest.latest_block_height), hash: String(latest.latest_block_hash) };
  }

  async block(height: number): Promise<BlockBundle> {
    const [blockJson, resultsJson] = await Promise.all([
      this.get(`/block?height=${height}`) as Promise<Json>,
      this.get(`/block_results?height=${height}`) as Promise<Json>,
    ]);
    const block = (((blockJson.result as Json).block as Json));
    const header = block.header as Json;
    const data = block.data as Json;
    const results = resultsJson.result as Json;
    const txsResults = (results.txs_results ?? []) as Json[];
    const txs = (data.txs ?? []) as string[];
    const bundle = {
      height,
      hash: String((blockJson.result as Json).block_id ? ((blockJson.result as Json).block_id as Json).hash : header.last_block_id ?? ""),
      parentHash: String((((header.last_block_id as Json | undefined)?.hash) ?? "")) || undefined,
      time: String(header.time),
      txCount: txs.length,
      txEvents: txsResults.map((tx, index) => ({
        txHash: String(tx.hash ?? txHashFromBase64(txs[index]) ?? `height-${height}-tx-${index}`),
        events: convertEvents((tx.events ?? []) as Json[]),
      })),
    };
    this.metrics?.recordFetchBlock();
    return bundle;
  }

  private async get(path: string): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      this.metrics?.beginRpcRequest();
      try {
        const response = await fetch(`${this.rpcUrl}${path}`, { signal: controller.signal });
        if (response.ok) return await response.json();
        const error = new Error(`RPC ${path} failed: ${response.status} ${response.statusText}`);
        this.metrics?.recordRpcError(response.status);
        if (!isTransientStatus(response.status) || attempt === this.maxRetries) throw error;
        lastError = error;
      } catch (error) {
        lastError = error;
        if (!(error instanceof Error && error.message.startsWith(`RPC ${path} failed:`))) this.metrics?.recordRpcError("network");
        if (attempt === this.maxRetries || !isTransientFetchError(error)) throw error;
      } finally {
        clearTimeout(timeout);
        this.metrics?.endRpcRequest();
      }
      await delay(100 * 2 ** attempt);
    }
    throw lastError instanceof Error ? lastError : new Error(`RPC ${path} failed`);
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isTransientFetchError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TypeError");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePoolState(value: unknown): PoolState {
  if (!value || typeof value !== "object") throw new Error("LCD pool query returned non-object data");
  const raw = value as Json;
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  const reserves = assets.map(normalizePoolAsset).filter((asset): asset is { denom: string; amount: string } => asset !== null);
  if (reserves.length === 0) throw new Error("LCD pool query returned no reserves");
  return { reserves, totalShare: raw.total_share === null || raw.total_share === undefined ? null : String(raw.total_share) };
}

function normalizePoolAsset(value: unknown): { denom: string; amount: string } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Json;
  const denom = normalizeAssetInfo(raw.info ?? raw.asset_info ?? raw.denom ?? raw.asset);
  if (!denom || raw.amount === null || raw.amount === undefined) return null;
  return { denom, amount: String(raw.amount) };
}

function normalizeAssetInfo(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const raw = value as Json;
  const native = raw.native_token;
  if (native && typeof native === "object") return String((native as Json).denom ?? "");
  const token = raw.token;
  if (token && typeof token === "object") return String((token as Json).contract_addr ?? "");
  return String(raw.denom ?? raw.asset ?? "");
}

function txHashFromBase64(tx?: string): string | undefined {
  if (!tx) return undefined;
  return createHash("sha256").update(Buffer.from(tx, "base64")).digest("hex").toUpperCase();
}

function convertEvents(events: Json[]): TendermintEvent[] {
  return events.map((event) => ({
    type: String(event.type),
    attributes: ((event.attributes ?? []) as Json[]).map((attribute) => ({
      key: String(attribute.key),
      value: String(attribute.value),
      index: Boolean(attribute.index),
    })),
  }));
}
