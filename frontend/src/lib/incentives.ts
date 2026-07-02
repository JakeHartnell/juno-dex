import type { Coin } from "@cosmjs/stargate";
import { dexRegistry, type RegistryPool } from "../config/registry";
import { isE2EMode } from "../e2e/mocks";
import type { Asset, ExecuteMsg, PoolInfoResponse, RewardInfo } from "./generated/Incentives.types";
import { queryContractSmart } from "./astroport/queries";

export type IncentivesPoolState = {
  configured: boolean;
  contractAddress?: string;
  lpToken: string;
  stakedAmount?: string;
  pendingRewards: Asset[];
  rewardInfo: RewardInfo[];
  poolInfo?: PoolInfoResponse;
  queryError?: string;
};

export function getIncentivesContractAddress(): string | undefined {
  return dexRegistry.incentives || undefined;
}

export async function queryIncentivesPoolState(pool: RegistryPool, user?: string, incentivesAddress = getIncentivesContractAddress()): Promise<IncentivesPoolState> {
  if (!incentivesAddress) {
    return { configured: false, lpToken: pool.lpToken, pendingRewards: [], rewardInfo: [] };
  }

  if (isE2EMode()) {
    return {
      configured: true,
      contractAddress: incentivesAddress,
      lpToken: pool.lpToken,
      stakedAmount: user ? "5000000000" : undefined,
      pendingRewards: [{ info: { native_token: { denom: pool.assets[0].id } }, amount: "1230000" }],
      rewardInfo: [{ reward: { int: { native_token: { denom: pool.assets[0].id } } }, rps: "42", index: "0", orphaned: "0" } as RewardInfo],
    };
  }

  const [poolInfoResult, rewardInfoResult, depositResult, pendingResult] = await Promise.allSettled([
    queryContractSmart<PoolInfoResponse>(incentivesAddress, { pool_info: { lp_token: pool.lpToken } }),
    queryContractSmart<RewardInfo[]>(incentivesAddress, { reward_info: { lp_token: pool.lpToken } }),
    user ? queryContractSmart<string>(incentivesAddress, { deposit: { lp_token: pool.lpToken, user } }) : Promise.resolve(undefined),
    user ? queryContractSmart<Asset[]>(incentivesAddress, { pending_rewards: { lp_token: pool.lpToken, user } }) : Promise.resolve([]),
  ]);

  const queryError = [poolInfoResult, rewardInfoResult, depositResult, pendingResult]
    .find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;

  return {
    configured: true,
    contractAddress: incentivesAddress,
    lpToken: pool.lpToken,
    poolInfo: poolInfoResult.status === "fulfilled" ? poolInfoResult.value : undefined,
    rewardInfo: rewardInfoResult.status === "fulfilled" ? rewardInfoResult.value : [],
    stakedAmount: depositResult.status === "fulfilled" ? depositResult.value : undefined,
    pendingRewards: pendingResult.status === "fulfilled" ? pendingResult.value : [],
    queryError: queryError ? errorMessage(queryError.reason) : undefined,
  };
}

export function createStakeLpExecute(pool: RegistryPool, amount: string, recipient?: string): { msg: ExecuteMsg; funds: Coin[] } {
  assertPositiveBaseAmount(amount, "stake amount");
  return {
    msg: { deposit: { recipient } },
    funds: [{ denom: pool.lpToken, amount }],
  };
}

export function createUnstakeLpMessage(pool: RegistryPool, amount: string): ExecuteMsg {
  assertPositiveBaseAmount(amount, "unstake amount");
  return { withdraw: { lp_token: pool.lpToken, amount } };
}

export function createClaimRewardsMessage(pool: RegistryPool): ExecuteMsg {
  if (!pool.lpToken) throw new Error("LP token is required to claim rewards");
  return { claim_rewards: { lp_tokens: [pool.lpToken] } };
}

export function totalRewardRps(rewardInfo: RewardInfo[]): number | undefined {
  const values = rewardInfo.map((reward) => Number(reward.rps)).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0);
}

function assertPositiveBaseAmount(amount: string, label: string) {
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error(`Enter a positive ${label}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
