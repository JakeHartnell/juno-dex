export type IndexerPagination = {
  limit: number;
  nextCursor: string | null;
};

export type IndexerAssetAmount = {
  denom: string;
  symbol?: string;
  reserve?: string | null;
  amount?: string;
  valueUsd?: number | null;
  valueJuno?: number | null;
  priceUsd?: number | null;
  priceJuno?: number | null;
  priceStatus?: "fresh" | "stale" | "missing" | string | null;
  priceSource?: string | null;
  priceUpdatedAt?: string | null;
  isPriceMock?: boolean;
};

export type IndexerPrice = {
  asset: string | null;
  priceUsd: number | null;
  priceJuno?: number | null;
  source: string | null;
  status: "fresh" | "stale" | "missing" | string;
  stale: boolean;
  observedAt: string | null;
  ageMs: number | null;
  isMock: boolean;
};

export type IndexerPoolMetrics = {
  id: string;
  pair: string;
  pairAddress: string;
  lpToken: string | null;
  poolType: string | null;
  assets: IndexerAssetAmount[];
  totalShare?: string | null;
  tvlUsd: number | null;
  tvlJuno?: number | null;
  volume24hUsd: number | null;
  volume24hJuno?: number | null;
  volume7dUsd: number | null;
  volume7dJuno?: number | null;
  feeBps: number | null;
  fees24hUsd: number | null;
  fees24hJuno?: number | null;
  feeApr: number;
  incentivesApr: number;
  totalApr: number;
  incentivized: boolean;
  updatedAt: string;
  dataSource: "indexer" | "mock" | string;
  isMock: boolean;
};

export type IndexerCandleInterval = "5m" | "1h" | "1d";

export type IndexerPoolCandle = {
  poolId: string | null;
  pairAddress: string | null;
  baseAsset: string | null;
  quoteAsset: string | null;
  interval: IndexerCandleInterval | string;
  bucketStart: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeQuote: number;
  tradeCount: number;
  dataSource: "indexer" | "mock" | string;
  isMock: boolean;
};

export type IndexerPoolCandlesResponse = IndexerPage<IndexerPoolCandle> & {
  meta?: {
    poolId?: string | null;
    pairAddress?: string | null;
    interval?: IndexerCandleInterval | string;
    baseAsset?: string | null;
    quoteAsset?: string | null;
    from?: string | null;
    to?: string | null;
    dataSource?: "indexer" | "mock" | string;
    isMock?: boolean;
  };
};

export type IndexerPoolPosition = {
  walletAddress: string;
  poolId: string;
  pairAddress: string;
  lpToken: string | null;
  lpBalance: string;
  shareBps: number;
  valueUsd: number | null;
  valueJuno?: number | null;
  assets: IndexerAssetAmount[];
  updatedAt: string;
  dataSource: "indexer" | "mock" | string;
  isMock: boolean;
};

export type IndexerWalletTransaction = {
  txHash: string;
  walletAddress: string | null;
  poolId: string | null;
  pairAddress: string | null;
  type: "swap" | "provide_liquidity" | "withdraw_liquidity" | "claim_rewards" | string;
  height: number;
  timestamp: string;
  offerAsset: IndexerAssetAmount | null;
  askAsset: IndexerAssetAmount | null;
  amountUsd: number | null;
  feeUsd: number | null;
  success: boolean;
  dataSource: "indexer" | "mock" | string;
  isMock: boolean;
};

export type IndexerProtocolStats = {
  poolCount: number;
  tvlUsd: number | null;
  tvlJuno?: number | null;
  volume24hUsd: number | null;
  volume24hJuno?: number | null;
  volume7dUsd: number | null;
  volume7dJuno?: number | null;
  fees24hUsd: number | null;
  fees24hJuno?: number | null;
  incentivizedPools: number;
  updatedAt: string;
  dataSource: "indexer" | "mock" | string;
  isMock: boolean;
};

export type IndexerHealth = {
  status: "ok" | string;
  service: string;
  dataSource: "indexer" | "mock" | string;
  isMock: boolean;
};

export type IndexerPage<T> = {
  data: T[];
  pagination: IndexerPagination;
};
