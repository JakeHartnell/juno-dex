import { describe, expect, it } from "vitest";
import type { RegistryPool } from "../../config/registry";
import type { PoolResponse } from "../generated/Pair.types";
import { buildPortfolioSummary, totalLpBalance } from "./portfolio";

const pool: RegistryPool = {
  id: "juno-usdc",
  label: "JUNO / USDC",
  pair: "juno1pair00000000000000000000000000000000000000",
  lpToken: "factory/juno1pair/astroport/share",
  type: "xyk",
  feeBps: 30,
  explorer: "https://ping.pub/juno",
  enabled: true,
  status: "active",
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 },
    { kind: "native", id: "ibc/usdc", symbol: "USDC", decimals: 6 },
  ],
};

const reserve: PoolResponse = {
  total_share: "1000000000",
  assets: [
    { info: { native_token: { denom: "ujuno" } }, amount: "5000000000" },
    { info: { native_token: { denom: "ibc/usdc" } }, amount: "10000000000" },
  ],
};

const balances = [
  { denom: pool.lpToken, symbol: "JUNO/USDC LP", decimals: 6, source: "lp" as const, amount: "100000000", isKnownDenom: true },
  { denom: "ujuno", symbol: "JUNO", decimals: 6, source: "registry" as const, amount: "2000000", isKnownDenom: true },
];

describe("portfolio summary", () => {
  it("returns an empty disconnected wallet summary without positions", () => {
    const summary = buildPortfolioSummary({ pools: [pool] });

    expect(summary.positions).toEqual([]);
    expect(summary.totalLpValueUsd).toBeNull();
    expect(summary.walletBalances).toEqual([]);
  });

  it("prefers indexer positions including staked LP and claimable rewards", () => {
    const summary = buildPortfolioSummary({
      pools: [pool],
      balances,
      reservesByPair: { [pool.pair]: reserve },
      preferIndexer: true,
      indexerPositions: [{
        walletAddress: "juno1wallet",
        poolId: pool.id,
        pairAddress: pool.pair,
        lpToken: pool.lpToken,
        lpBalance: "100000000",
        stakedLpBalance: "50000000",
        shareBps: 1000,
        valueUsd: 42.5,
        valueJuno: 100,
        updatedAt: "2026-07-02T00:00:00.000Z",
        dataSource: "indexer",
        isMock: false,
        assets: [
          { denom: "ujuno", symbol: "JUNO", amount: "500000000", valueUsd: 20, valueJuno: 50, priceStatus: "fresh" },
          { denom: "ibc/usdc", symbol: "USDC", amount: "1000000000", valueUsd: 22.5, valueJuno: 50, priceStatus: "fresh" },
        ],
        claimableRewards: [{ denom: "ujuno", symbol: "JUNO", amount: "1000000", valueUsd: 0.75, valueJuno: 1, priceStatus: "fresh" }],
      }],
    });

    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0]).toMatchObject({ source: "indexer", stakedLpBalance: "50000000", valueUsd: 42.5 });
    expect(totalLpBalance(summary.positions[0])).toBe("150000000");
    expect(summary.totalLpValueUsd).toBe(42.5);
    expect(summary.totalLpValueJuno).toBe(100);
    expect(summary.totalClaimableUsd).toBe(0.75);
    expect(summary.totalClaimableJuno).toBe(1);
  });

  it("uses Juno values when USD prices are missing", () => {
    const summary = buildPortfolioSummary({
      pools: [pool],
      preferIndexer: true,
      indexerPositions: [{
        walletAddress: "juno1wallet",
        poolId: pool.id,
        pairAddress: pool.pair,
        lpToken: pool.lpToken,
        lpBalance: "100000000",
        bondedBalance: "50000000",
        shareBps: 1000,
        valueUsd: null,
        valueJuno: 125,
        updatedAt: "2026-07-02T00:00:00.000Z",
        dataSource: "indexer",
        isMock: false,
        assets: [
          { denom: "ujuno", symbol: "JUNO", amount: "500000000", valueUsd: null, valueJuno: 100, priceStatus: "missing" },
        ],
        claimableRewards: [{ denom: "ujuno", symbol: "JUNO", amount: "1000000", valueUsd: null, valueJuno: 1, priceStatus: "missing" }],
      }],
    });

    expect(summary.positions[0]).toMatchObject({ stakedLpBalance: "50000000", valueUsd: null, valueJuno: 125 });
    expect(totalLpBalance(summary.positions[0])).toBe("150000000");
    expect(summary.totalLpValueUsd).toBeNull();
    expect(summary.totalLpValueJuno).toBe(125);
    expect(summary.totalClaimableUsd).toBeNull();
    expect(summary.totalClaimableJuno).toBe(1);
    expect(summary.missingPositionPrices).toBe(0);
    expect(summary.missingRewardPrices).toBe(0);
  });

  it("adds pending incentives rewards when indexer positions do not include rewards", () => {
    const summary = buildPortfolioSummary({
      pools: [pool],
      preferIndexer: true,
      incentivesByLpToken: {
        [pool.lpToken]: {
          configured: true,
          lpToken: pool.lpToken,
          stakedAmount: "50000000",
          pendingRewards: [{ info: { native_token: { denom: "ujuno" } }, amount: "2500000" }],
          rewardInfo: [],
        },
      },
      indexerPositions: [{
        walletAddress: "juno1wallet",
        poolId: pool.id,
        pairAddress: pool.pair,
        lpToken: pool.lpToken,
        lpBalance: "100000000",
        shareBps: 1000,
        valueUsd: null,
        valueJuno: 125,
        updatedAt: "2026-07-02T00:00:00.000Z",
        dataSource: "indexer",
        isMock: false,
        assets: [],
      }],
    });

    expect(summary.positions[0].stakedLpBalance).toBe("50000000");
    expect(summary.positions[0].rewards[0]).toMatchObject({ denom: "ujuno", symbol: "JUNO", amount: "2500000", valueJuno: 2.5 });
    expect(summary.claimableRewardCount).toBe(1);
    expect(summary.totalClaimableUsd).toBeNull();
    expect(summary.totalClaimableJuno).toBe(2.5);
    expect(summary.missingRewardPrices).toBe(0);
  });

  it("falls back to on-chain LP balances and reserves when the indexer is unavailable", () => {
    const summary = buildPortfolioSummary({
      pools: [pool],
      balances,
      reservesByPair: { [pool.pair]: reserve },
      preferIndexer: false,
      indexerPositions: [],
    });

    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0]).toMatchObject({ source: "on-chain", lpBalance: "100000000", shareBps: 1000, valueUsd: null });
    expect(summary.positions[0].assets.map((asset) => asset.amount)).toEqual(["500000000", "1000000000"]);
  });

  it("keeps aggregate value unknown when any position price is missing", () => {
    const summary = buildPortfolioSummary({
      pools: [pool],
      preferIndexer: true,
      indexerPositions: [{
        walletAddress: "juno1wallet",
        poolId: pool.id,
        pairAddress: pool.pair,
        lpToken: pool.lpToken,
        lpBalance: "100000000",
        shareBps: 1000,
        valueUsd: null,
        updatedAt: "2026-07-02T00:00:00.000Z",
        dataSource: "indexer",
        isMock: false,
        assets: [{ denom: "ujuno", symbol: "JUNO", amount: "500000000", valueUsd: null, priceStatus: "missing" }],
      }],
    });

    expect(summary.totalLpValueUsd).toBeNull();
    expect(summary.missingPositionPrices).toBe(1);
  });
});
