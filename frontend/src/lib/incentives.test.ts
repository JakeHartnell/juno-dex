import { describe, expect, it } from "vitest";
import type { RegistryPool } from "../config/registry";
import { createClaimRewardsMessage, createStakeLpExecute, createUnstakeLpMessage, queryIncentivesPoolState, totalRewardRps } from "./incentives";

const pool: RegistryPool = {
  id: "juno-token",
  label: "JUNO / TOKEN",
  pair: "juno1pair",
  lpToken: "factory/juno1pair/astroport/share",
  type: "xyk",
  feeBps: 30,
  enabled: true,
  explorer: "https://ping.pub/juno/wasm/contract/juno1pair",
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 },
    { kind: "native", id: "factory/pair/token", symbol: "TOKEN", decimals: 6 },
  ],
};

describe("incentives helpers", () => {
  it("returns a safe empty state when incentives are not configured", async () => {
    await expect(queryIncentivesPoolState(pool, "juno1wallet", "")).resolves.toEqual({
      configured: false,
      lpToken: pool.lpToken,
      pendingRewards: [],
      rewardInfo: [],
    });
  });

  it("builds stake, unstake, and claim execute payloads without broadcasting", () => {
    expect(createStakeLpExecute(pool, "1230000")).toEqual({
      msg: { deposit: { recipient: undefined } },
      funds: [{ denom: pool.lpToken, amount: "1230000" }],
    });
    expect(createUnstakeLpMessage(pool, "420000")).toEqual({ withdraw: { lp_token: pool.lpToken, amount: "420000" } });
    expect(createClaimRewardsMessage(pool)).toEqual({ claim_rewards: { lp_tokens: [pool.lpToken] } });
  });

  it("validates positive amounts for stake and unstake", () => {
    expect(() => createStakeLpExecute(pool, "0")).toThrow(/positive stake amount/i);
    expect(() => createUnstakeLpMessage(pool, "abc")).toThrow(/positive unstake amount/i);
  });

  it("sums active reward rates without fabricating APR", () => {
    expect(totalRewardRps([
      { index: "0", orphaned: "0", rps: "1.5", reward: { int: { native_token: { denom: "ujuno" } } } },
      { index: "0", orphaned: "0", rps: "2.25", reward: { ext: { info: { native_token: { denom: "factory/reward" } }, next_update_ts: 10 } } },
    ])).toBe(3.75);
    expect(totalRewardRps([])).toBeUndefined();
  });
});
