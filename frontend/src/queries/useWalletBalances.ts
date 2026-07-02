import { useMemo } from "react";
import type { Coin } from "@cosmjs/stargate";
import { useQuery } from "@tanstack/react-query";
import { enabledPools, type RegistryAsset, type RegistryPool } from "../config/registry";
import { e2eBalances, isE2EMode } from "../e2e/mocks";
import { DEFAULT_DECIMALS, resolveAssetMetadata } from "../lib/assets/assetMetadata";
import { getReadonlyStargateClient } from "../lib/cosmjs/clients";

export const walletBalancesQueryKey = (address: string | undefined) => ["balances", address] as const;

export type ResolvedDenom = {
  denom: string;
  symbol: string;
  decimals: number;
  name?: string;
  denomTrace?: string;
  logoURI?: string;
  source: "registry" | "lp" | "chain-registry" | "raw";
  poolId?: string;
  poolLabel?: string;
};

export type WalletBalance = ResolvedDenom & {
  amount: string;
  isKnownDenom: boolean;
};

function denomForAsset(asset: RegistryAsset) {
  return asset.id;
}

export function getKnownBalanceDenoms(pools: RegistryPool[] = enabledPools): string[] {
  return Array.from(new Set(pools.flatMap((pool) => [...pool.assets.map(denomForAsset), pool.lpToken])));
}

export function resolveDenom(denom: string, pools: RegistryPool[] = enabledPools): ResolvedDenom {
  for (const pool of pools) {
    const asset = pool.assets.find((candidate) => denomForAsset(candidate) === denom);
    if (asset) {
      return {
        denom,
        symbol: asset.symbol,
        name: asset.name,
        decimals: asset.decimals,
        denomTrace: asset.denomTrace,
        logoURI: asset.logoURI,
        source: "registry",
        poolId: pool.id,
        poolLabel: pool.label,
      };
    }

    if (pool.lpToken === denom) {
      return {
        denom,
        symbol: `${pool.assets.map((asset) => asset.symbol).join("/")} LP`,
        decimals: DEFAULT_DECIMALS,
        source: "lp",
        poolId: pool.id,
        poolLabel: pool.label,
      };
    }
  }

  const metadata = resolveAssetMetadata(denom);
  return {
    denom,
    symbol: metadata.symbol,
    name: metadata.name,
    decimals: metadata.decimals,
    denomTrace: metadata.denomTrace,
    logoURI: metadata.logoURI,
    source: metadata.source === "chain-registry" ? "chain-registry" : "raw",
  };
}

function mergeKnownDenoms(coins: readonly Coin[], pools: RegistryPool[]): WalletBalance[] {
  const coinMap = new Map(coins.map((coin) => [coin.denom, coin.amount]));
  const knownDenoms = getKnownBalanceDenoms(pools);
  const rows: WalletBalance[] = knownDenoms.map((denom) => ({
    ...resolveDenom(denom, pools),
    amount: coinMap.get(denom) ?? "0",
    isKnownDenom: true,
  }));

  for (const coin of coins) {
    if (!coinMap.has(coin.denom)) continue;
    if (knownDenoms.includes(coin.denom)) continue;
    rows.push({ ...resolveDenom(coin.denom, pools), amount: coin.amount, isKnownDenom: false });
  }

  return rows;
}

export function getWalletBalanceAmount(balances: readonly WalletBalance[] | undefined, denom: string): string | undefined {
  return balances?.find((balance) => balance.denom === denom)?.amount;
}

export function useWalletBalances(address: string | undefined, pools: RegistryPool[] = enabledPools) {
  const query = useQuery({
    queryKey: walletBalancesQueryKey(address),
    enabled: Boolean(address),
    queryFn: async () => {
      if (!address) return [];
      if (isE2EMode()) return e2eBalances(pools);
      const client = await getReadonlyStargateClient();
      const coins = await client.getAllBalances(address);
      return mergeKnownDenoms(coins, pools);
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  return useMemo(() => ({
    ...query,
    nativeAndPoolBalances: query.data?.filter((balance) => balance.isKnownDenom) ?? [],
    byDenom: new Map((query.data ?? []).map((balance) => [balance.denom, balance])),
  }), [query]);
}
