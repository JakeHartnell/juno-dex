import type { RegistryPool } from "../config/registry";
import type { PoolResponse, SimulationResponse, ReverseSimulationResponse, SimulateSwapOperationsResponse } from "../lib/astroport/queries";
import type { WalletBalance } from "../queries/useWalletBalances";

export const E2E_WALLET_ADDRESS = "juno1e2etestwallet0000000000000000000000000000000000";
export const E2E_TX_HASH_PREFIX = "E2E_MOCK_TX_";

type ExecuteCall = {
  sender: string;
  contractAddress: string;
  msg: unknown;
  fee: unknown;
  memo?: string;
  funds?: unknown;
};

type E2EWindow = Window & typeof globalThis & {
  __DEX_E2E_TXS__?: ExecuteCall[];
  __DEX_E2E_TX_COUNT__?: number;
};

export function isE2EMode() {
  return import.meta.env.VITE_DEX_E2E === "true";
}

function txHashFor(label: string) {
  const win = window as E2EWindow;
  win.__DEX_E2E_TX_COUNT__ = (win.__DEX_E2E_TX_COUNT__ ?? 0) + 1;
  return `${E2E_TX_HASH_PREFIX}${label}_${String(win.__DEX_E2E_TX_COUNT__).padStart(3, "0")}`;
}

function recordExecute(call: ExecuteCall) {
  const win = window as E2EWindow;
  win.__DEX_E2E_TXS__ = [...(win.__DEX_E2E_TXS__ ?? []), call];
}

function labelForMsg(msg: unknown) {
  if (msg && typeof msg === "object") {
    if ("swap" in msg || "execute_swap_operations" in msg) return "SWAP";
    if ("provide_liquidity" in msg) return "PROVIDE";
    if ("withdraw_liquidity" in msg || "send" in msg) return "WITHDRAW";
    if ("create_pair" in msg) return "CREATE_PAIR";
    if ("deposit" in msg) return "STAKE";
    if ("withdraw" in msg) return "UNSTAKE";
    if ("claim_rewards" in msg) return "CLAIM";
  }
  return "BROADCAST";
}

export function createE2ESigningClient() {
  return {
    execute: async (sender: string, contractAddress: string, msg: unknown, fee: unknown, memo?: string, funds?: unknown) => {
      recordExecute({ sender, contractAddress, msg, fee, memo, funds });
      return {
        transactionHash: txHashFor(labelForMsg(msg)),
        height: 123456,
        gasWanted: 180000,
        gasUsed: 125000,
        logs: [],
        events: [],
        pairAddress: "juno1e2ecreatedpair00000000000000000000000000000000",
      };
    },
  };
}

export function e2ePoolResponse(pool: RegistryPool): PoolResponse {
  return {
    assets: pool.assets.map((asset, index) => ({
      info: asset.kind === "cw20" ? { token: { contract_addr: asset.id } } : { native_token: { denom: asset.id } },
      amount: index === 0 ? "100000000000" : "200000000000",
    })),
    total_share: "100000000000",
  } as PoolResponse;
}

export function e2eSwapSimulation(amount: string): SimulationResponse {
  const offer = BigInt(amount || "0");
  const returnAmount = (offer * 197n) / 100n;
  return {
    return_amount: returnAmount.toString(),
    spread_amount: (offer / 1000n).toString(),
    commission_amount: (offer / 300n).toString(),
  } as SimulationResponse;
}

export function e2eReverseSwapSimulation(amount: string): ReverseSimulationResponse {
  const ask = BigInt(amount || "0");
  return {
    offer_amount: ((ask * 103n) / 200n).toString(),
    spread_amount: (ask / 1000n).toString(),
    commission_amount: (ask / 300n).toString(),
  } as ReverseSimulationResponse;
}

export function e2eRouterSimulation(amount: string): SimulateSwapOperationsResponse {
  return { amount: ((BigInt(amount || "0") * 197n) / 100n).toString() } as SimulateSwapOperationsResponse;
}

export function e2eBalances(pools: RegistryPool[]): WalletBalance[] {
  return pools.flatMap((pool) => [
    {
      denom: pool.assets[0].id,
      symbol: pool.assets[0].symbol,
      decimals: pool.assets[0].decimals,
      name: pool.assets[0].name,
      source: "registry" as const,
      poolId: pool.id,
      poolLabel: pool.label,
      amount: "500000000000",
      isKnownDenom: true,
    },
    {
      denom: pool.assets[1].id,
      symbol: pool.assets[1].symbol,
      decimals: pool.assets[1].decimals,
      name: pool.assets[1].name,
      source: "registry" as const,
      poolId: pool.id,
      poolLabel: pool.label,
      amount: "500000000000",
      isKnownDenom: true,
    },
    {
      denom: pool.lpToken,
      symbol: `${pool.assets[0].symbol}/${pool.assets[1].symbol} LP`,
      decimals: 6,
      source: "lp" as const,
      poolId: pool.id,
      poolLabel: pool.label,
      amount: "25000000000",
      isKnownDenom: true,
    },
  ]);
}
