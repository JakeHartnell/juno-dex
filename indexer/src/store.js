import { normalizePoolRecord, normalizePositionRecord, normalizeTxRecord } from "./calculations.js";

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

export function paginate(items, { limit = DEFAULT_PAGE_LIMIT, cursor } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
  const start = cursor ? Math.max(Number(cursor) || 0, 0) : 0;
  const page = items.slice(start, start + safeLimit);
  const nextCursor = start + safeLimit < items.length ? String(start + safeLimit) : null;
  return { data: page, pagination: { limit: safeLimit, nextCursor } };
}

export class InMemoryMetricsStore {
  constructor({ pools = [], positions = [], transactions = [] } = {}) {
    this.pools = pools.map(normalizePoolRecord);
    this.positions = positions.map(normalizePositionRecord);
    this.transactions = transactions.map(normalizeTxRecord);
  }

  listPools(query = {}) {
    const rows = this.pools
      .filter((pool) => !query.pair || pool.pairAddress === query.pair || pool.id === query.pair)
      .sort((a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1));
    return paginate(rows, query);
  }

  getPool(id) {
    return this.pools.find((pool) => pool.id === id || pool.pairAddress === id || pool.pair === id) ?? null;
  }

  getProtocolStats() {
    const pools = this.pools;
    const totals = pools.reduce((acc, pool) => {
      acc.tvlUsd += pool.tvlUsd ?? 0;
      acc.volume24hUsd += pool.volume24hUsd ?? 0;
      acc.volume7dUsd += pool.volume7dUsd ?? 0;
      acc.fees24hUsd += pool.fees24hUsd ?? 0;
      if (pool.incentivized) acc.incentivizedPools += 1;
      return acc;
    }, { tvlUsd: 0, volume24hUsd: 0, volume7dUsd: 0, fees24hUsd: 0, incentivizedPools: 0 });

    return {
      poolCount: pools.length,
      ...totals,
      updatedAt: pools.reduce((latest, pool) => pool.updatedAt > latest ? pool.updatedAt : latest, new Date(0).toISOString()),
      dataSource: pools.some((pool) => pool.isMock) ? "mock" : "indexer",
      isMock: pools.some((pool) => pool.isMock),
    };
  }

  listPoolPositions(poolId, query = {}) {
    const rows = this.positions.filter((position) => position.poolId === poolId || position.pairAddress === poolId);
    return paginate(rows, query);
  }

  listWalletPositions(walletAddress, query = {}) {
    const rows = this.positions.filter((position) => position.walletAddress === walletAddress);
    return paginate(rows, query);
  }

  listWalletHistory(walletAddress, query = {}) {
    const rows = this.transactions
      .filter((tx) => tx.walletAddress === walletAddress)
      .sort((a, b) => b.height - a.height);
    return paginate(rows, query);
  }
}

export function createEmptyStore() {
  return new InMemoryMetricsStore();
}

export function createDevMockStore(now = new Date("2026-07-02T00:00:00.000Z")) {
  const updatedAt = now.toISOString();
  const pairAddress = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";
  const walletAddress = "juno1mockwalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  return new InMemoryMetricsStore({
    pools: [{
      id: pairAddress,
      pairAddress,
      lpToken: "factory/juno1mock/lp",
      poolType: "xyk",
      assets: [
        { denom: "ujuno", symbol: "JUNO", reserve: "1000000000", valueUsd: 1250 },
        { denom: "ibc/mock-usdc", symbol: "USDC", reserve: "1250000000", valueUsd: 1250 },
      ],
      tvlUsd: 2500,
      volume24hUsd: 400,
      volume7dUsd: 2400,
      feeBps: 30,
      emissionsPerDayUsd: 1.5,
      updatedAt,
      dataSource: "mock",
      isMock: true,
    }],
    positions: [{
      walletAddress,
      poolId: pairAddress,
      pairAddress,
      lpToken: "factory/juno1mock/lp",
      lpBalance: "1000000",
      shareBps: 100,
      valueUsd: 25,
      assets: [
        { denom: "ujuno", symbol: "JUNO", amount: "10000000", valueUsd: 12.5 },
        { denom: "ibc/mock-usdc", symbol: "USDC", amount: "12500000", valueUsd: 12.5 },
      ],
      updatedAt,
      dataSource: "mock",
      isMock: true,
    }],
    transactions: [{
      txHash: "MOCK_TX_HASH_DO_NOT_USE_AS_PRODUCTION_DATA",
      walletAddress,
      poolId: pairAddress,
      pairAddress,
      type: "swap",
      height: 1,
      timestamp: updatedAt,
      offerAsset: { denom: "ujuno", amount: "1000000" },
      askAsset: { denom: "ibc/mock-usdc", amount: "1250000" },
      amountUsd: 1.25,
      feeUsd: 0.00375,
      success: true,
      dataSource: "mock",
      isMock: true,
    }],
  });
}
