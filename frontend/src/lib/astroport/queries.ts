import type { RegistryAsset, RegistryPool } from "../../config/registry";
import { dexRegistry } from "../../config/registry";
import { toAsset } from "./assetInfo";

export type PoolAssetResponse = { info: unknown; amount: string };
export type PoolResponse = { assets: PoolAssetResponse[]; total_share: string };
export type SimulationResponse = { return_amount: string; spread_amount: string; commission_amount: string };

function encodeSmartQuery(message: unknown): string {
  const json = JSON.stringify(message);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function queryContractSmart<T>(contractAddress: string, message: unknown): Promise<T> {
  const encoded = encodeURIComponent(encodeSmartQuery(message));
  const response = await fetch(`${dexRegistry.restEndpoint}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${encoded}`);
  if (!response.ok) throw new Error(`REST smart query failed: ${response.status}`);
  const payload = await response.json() as { data: T };
  return payload.data;
}

export async function queryPairPool(pairAddress: string): Promise<PoolResponse> {
  return queryContractSmart(pairAddress, { pool: {} });
}

export async function querySwapSimulation(
  pairAddress: string,
  offerAsset: RegistryAsset,
  askAsset: RegistryAsset,
  amount: string,
): Promise<SimulationResponse> {
  return queryContractSmart(pairAddress, {
    simulation: {
      offer_asset: toAsset(offerAsset, amount),
      ask_asset_info: askAsset.kind === "cw20"
        ? { token: { contract_addr: askAsset.id } }
        : { native_token: { denom: askAsset.id } },
    },
  });
}

export function findOppositeAsset(pool: RegistryPool, offerId: string): RegistryAsset {
  const asset = pool.assets.find((candidate) => candidate.id !== offerId);
  if (!asset) throw new Error("pool must contain two distinct assets");
  return asset;
}
