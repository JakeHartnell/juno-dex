import type { IndexerHealth, IndexerPage, IndexerPoolMetrics, IndexerPoolPosition, IndexerProtocolStats, IndexerWalletTransaction } from "./types";

export type IndexerClientOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
};

function trimBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function getJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Indexer request failed: ${response.status}`);
  return await response.json() as T;
}

function withPagination(path: string, params: { limit?: number; cursor?: string } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function createIndexerClient({ baseUrl, fetcher = fetch }: IndexerClientOptions) {
  const root = trimBaseUrl(baseUrl);
  return {
    health: () => getJson<IndexerHealth>(fetcher, `${root}/health`),
    stats: () => getJson<IndexerProtocolStats>(fetcher, `${root}/stats`),
    pools: (params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerPoolMetrics>>(fetcher, `${root}${withPagination("/pools", params)}`),
    pool: (id: string) => getJson<IndexerPoolMetrics>(fetcher, `${root}/pools/${encodeURIComponent(id)}`),
    poolPositions: (id: string, params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerPoolPosition>>(fetcher, `${root}${withPagination(`/pools/${encodeURIComponent(id)}/positions`, params)}`),
    walletPositions: (address: string, params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerPoolPosition>>(fetcher, `${root}${withPagination(`/wallets/${encodeURIComponent(address)}/positions`, params)}`),
    walletHistory: (address: string, params?: { limit?: number; cursor?: string }) => getJson<IndexerPage<IndexerWalletTransaction>>(fetcher, `${root}${withPagination(`/wallets/${encodeURIComponent(address)}/history`, params)}`),
  };
}

export function getConfiguredIndexerBaseUrl() {
  return (import.meta.env.VITE_DEX_INDEXER_URL as string | undefined)?.replace(/\/$/, "");
}
