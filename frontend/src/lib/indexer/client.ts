import type { IndexerHealth, IndexerPage, IndexerPoolMetrics, IndexerPoolPosition, IndexerPrice, IndexerProtocolStats, IndexerWalletTransaction } from "./types";

export type IndexerClientOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export class IndexerRequestError extends Error {
  readonly status?: number;
  readonly code: "disabled" | "http" | "timeout" | "network" | "invalid-response";

  constructor(message: string, options: { status?: number; code: IndexerRequestError["code"]; cause?: unknown }) {
    super(message);
    this.name = "IndexerRequestError";
    this.status = options.status;
    this.code = options.code;
    this.cause = options.cause;
  }
}

function trimBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function getJson<T>(fetcher: typeof fetch, url: string, timeoutMs?: number): Promise<T> {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetcher(url, controller ? { signal: controller.signal } : undefined);
    if (!response.ok) throw new IndexerRequestError(`Indexer request failed: ${response.status}`, { status: response.status, code: "http" });
    return await response.json() as T;
  } catch (error) {
    if (error instanceof IndexerRequestError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new IndexerRequestError("Indexer request timed out", { code: "timeout", cause: error });
    }
    throw new IndexerRequestError("Indexer request failed", { code: "network", cause: error });
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

function withPagination(path: string, params: { limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function pricesPath(assets: readonly string[]) {
  const query = new URLSearchParams();
  query.set("assets", assets.join(","));
  return `/prices?${query.toString()}`;
}

export function createIndexerClient({ baseUrl, fetcher = fetch, timeoutMs }: IndexerClientOptions) {
  const root = trimBaseUrl(baseUrl);
  return {
    health: () => getJson<IndexerHealth>(fetcher, `${root}/health`, timeoutMs),
    stats: () => getJson<IndexerProtocolStats>(fetcher, `${root}/stats`, timeoutMs),
    prices: (assets: readonly string[]) => getJson<{ data: IndexerPrice[] }>(fetcher, `${root}${pricesPath(assets)}`, timeoutMs),
    price: (asset: string) => getJson<IndexerPrice>(fetcher, `${root}/prices/${encodeURIComponent(asset)}`, timeoutMs),
    pools: (params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerPoolMetrics>>(fetcher, `${root}${withPagination("/pools", params)}`, timeoutMs),
    pool: (id: string) => getJson<IndexerPoolMetrics>(fetcher, `${root}/pools/${encodeURIComponent(id)}`, timeoutMs),
    poolPositions: (id: string, params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerPoolPosition>>(fetcher, `${root}${withPagination(`/pools/${encodeURIComponent(id)}/positions`, params)}`, timeoutMs),
    walletPositions: (address: string, params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerPoolPosition>>(fetcher, `${root}${withPagination(`/wallets/${encodeURIComponent(address)}/positions`, params)}`, timeoutMs),
    walletHistory: (address: string, params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerWalletTransaction>>(fetcher, `${root}${withPagination(`/wallets/${encodeURIComponent(address)}/history`, params)}`, timeoutMs),
  };
}

export function getConfiguredIndexerBaseUrl() {
  return (import.meta.env.VITE_DEX_INDEXER_URL as string | undefined)?.replace(/\/$/, "");
}
