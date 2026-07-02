import type { RegistryAsset, RegistryPool } from "../../config/registry";
import type { ConfigResponse, PairsResponse, QueryMsg as FactoryQueryMsg } from "../generated/Factory.types";
import type { PoolResponse, QueryMsg as PairQueryMsg, ReverseSimulationResponse, SimulationResponse } from "../generated/Pair.types";
import type { QueryMsg as RouterQueryMsg, SimulateSwapOperationsResponse, SwapOperation } from "../generated/Router.types";
import { dexRegistry } from "../../config/registry";
import { toAsset } from "./assetInfo";

export type PoolAssetResponse = { info: unknown; amount: string };
export type { PoolResponse, ReverseSimulationResponse, SimulationResponse } from "../generated/Pair.types";
export type SwapQuoteMode = "exact-in" | "exact-out";
export type { SimulateSwapOperationsResponse } from "../generated/Router.types";

function encodeSmartQuery(message: unknown): string {
  const json = JSON.stringify(message);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function queryContractSmart<T>(contractAddress: string, message: unknown): Promise<T> {
  const encoded = encodeURIComponent(encodeSmartQuery(message));
  const response = await fetch(`${dexRegistry.restEndpoint}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${encoded}`);
  if (!response.ok) throw new Error(`REST smart query failed: ${response.status}`);
  const payload = await response.json() as { data: T };
  return payload.data;
}

export async function queryPairPool(pairAddress: string): Promise<PoolResponse> {
  return queryContractSmart(pairAddress, { pool: {} } satisfies PairQueryMsg);
}

export async function queryFactoryPairs(message: Extract<FactoryQueryMsg, { pairs: unknown }>): Promise<PairsResponse> {
  return queryContractSmart(dexRegistry.factory, message);
}

export async function queryFactoryConfig(): Promise<ConfigResponse> {
  return queryContractSmart(dexRegistry.factory, { config: {} } satisfies FactoryQueryMsg);
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
  } satisfies PairQueryMsg);
}

export async function queryReverseSwapSimulation(
  pairAddress: string,
  offerAsset: RegistryAsset,
  askAsset: RegistryAsset,
  askAmount: string,
): Promise<ReverseSimulationResponse> {
  return queryContractSmart(pairAddress, {
    reverse_simulation: {
      ask_asset: toAsset(askAsset, askAmount),
      offer_asset_info: offerAsset.kind === "cw20"
        ? { token: { contract_addr: offerAsset.id } }
        : { native_token: { denom: offerAsset.id } },
    },
  } satisfies PairQueryMsg);
}

export async function queryRouterSimulation(operations: SwapOperation[], offerAmount: string): Promise<SimulateSwapOperationsResponse> {
  if (!dexRegistry.router) throw new Error("Router contract is not configured");
  return queryContractSmart(dexRegistry.router, {
    simulate_swap_operations: {
      offer_amount: offerAmount,
      operations,
    },
  } satisfies RouterQueryMsg);
}

export async function queryRouterReverseSimulation(operations: SwapOperation[], askAmount: string): Promise<SimulateSwapOperationsResponse> {
  if (!dexRegistry.router) throw new Error("Router contract is not configured");
  return queryContractSmart(dexRegistry.router, {
    reverse_simulate_swap_operations: {
      ask_amount: askAmount,
      operations,
    },
  } satisfies RouterQueryMsg);
}

export function findOppositeAsset(pool: RegistryPool, offerId: string): RegistryAsset {
  const asset = pool.assets.find((candidate) => candidate.id !== offerId);
  if (!asset) throw new Error("pool must contain two distinct assets");
  return asset;
}
