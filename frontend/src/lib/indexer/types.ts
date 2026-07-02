export type IndexerPagination = {
  limit: number;
  nextCursor: string | null;
};

export type IndexerAssetAmount = {
  denom: string;
  symbol?: string;
  reserve?: string;
  amount?: string;
  valueUsd?: number | null;
};

export type IndexerPoolMetrics = {
  id: string;
  pair: string;
  pairAddress: string;
  lpToken: string | null;
  poolType: string | null;
  assets: IndexerAssetAmount[];
  tvlUsd: number | null;
  volume24hUsd: number | null;
  volume7dUsd: number | null;
  feeBps: number | null;
  fees24hUsd: number | null;
  feeApr: number;
  incentivesApr: number;
  totalApr: number;
  incentivized: boolean;
  updatedAt: string;
  dataSource: "indexer" | "mock" | string;
  isMock: boolean;
};

export type IndexerPoolPosition = {
  walletAddress: string;
  poolId: string;
  pairAddress: string;
  lpToken: string | null;
  lpBalance: string;
  shareBps: number;
  valueUsd: number | null;
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
  tvlUsd: number;
  volume24hUsd: number;
  volume7dUsd: number;
  fees24hUsd: number;
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
