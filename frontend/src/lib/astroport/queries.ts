import type { RegistryAsset, RegistryPool } from "../../config/registry";
import type { ConfigResponse, PairInfo, PairsResponse, QueryMsg as FactoryQueryMsg } from "../generated/Factory.types";
import type { PoolResponse, QueryMsg as PairQueryMsg, ReverseSimulationResponse, SimulationResponse } from "../generated/Pair.types";
import type { QueryMsg as RouterQueryMsg, SimulateSwapOperationsResponse, SwapOperation } from "../generated/Router.types";
import { dexRegistry } from "../../config/registry";
import { e2ePoolResponse, e2eReverseSwapSimulation, e2eRouterSimulation, e2eSwapSimulation, isE2EMode } from "../../e2e/mocks";
import { toAsset } from "./assetInfo";
import { getReadonlyCosmWasmClient } from "../cosmjs/clients";

export type PoolAssetResponse = { info: unknown; amount: string };
export type { PoolResponse, ReverseSimulationResponse, SimulationResponse } from "../generated/Pair.types";
export type SwapQuoteMode = "exact-in" | "exact-out";
export type { SimulateSwapOperationsResponse } from "../generated/Router.types";

const DEFAULT_REST_TIMEOUT_MS = 8_000;

function restTimeoutMs() {
  const raw = import.meta.env.VITE_DEX_REST_TIMEOUT_MS as string | undefined;
  const value = raw ? Number(raw) : DEFAULT_REST_TIMEOUT_MS;
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_REST_TIMEOUT_MS;
}

function encodeSmartQuery(message: unknown): string {
  const json = JSON.stringify(message);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function queryContractSmart<T>(contractAddress: string, message: unknown): Promise<T> {
  const encoded = encodeURIComponent(encodeSmartQuery(message));
  const timeoutMs = restTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${dexRegistry.restEndpoint}/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${encoded}`, { signal: controller.signal });
  } catch (error) {
    return queryContractSmartRpc<T>(contractAddress, message, error instanceof DOMException && error.name === "AbortError" ? `REST timed out after ${timeoutMs}ms` : "REST unavailable");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return queryContractSmartRpc<T>(contractAddress, message, `REST returned ${response.status}`);
  const payload = await response.json() as { data: T };
  return payload.data;
}

async function queryContractSmartRpc<T>(contractAddress: string, message: unknown, restFailure: string): Promise<T> {
  try {
    const client = await getReadonlyCosmWasmClient();
    return await client.queryContractSmart(contractAddress, message) as T;
  } catch {
    throw new Error(`Smart query unavailable (${restFailure}; RPC fallback failed)`);
  }
}

export async function queryPairPool(pairAddress: string): Promise<PoolResponse> {
  if (isE2EMode()) {
    const pool = dexRegistry.pools.find((candidate) => candidate.pair === pairAddress) ?? dexRegistry.pools[0];
    return e2ePoolResponse(pool);
  }
  return queryContractSmart(pairAddress, { pool: {} } satisfies PairQueryMsg);
}

export async function queryFactoryPairs(message: Extract<FactoryQueryMsg, { pairs: unknown }>): Promise<PairsResponse> {
  if (isE2EMode()) return { pairs: [] } as PairsResponse;
  return queryContractSmart(dexRegistry.factory, message);
}

export async function queryFactoryConfig(): Promise<ConfigResponse> {
  if (isE2EMode()) {
    return {
      owner: "juno1e2eowner000000000000000000000000000000000000",
      token_code_id: 1,
      pair_configs: [{ code_id: 1, pair_type: { xyk: {} }, total_fee_bps: 30, maker_fee_bps: 10, is_disabled: false, is_generator_disabled: false }],
    } as ConfigResponse;
  }
  return queryContractSmart(dexRegistry.factory, { config: {} } satisfies FactoryQueryMsg);
}

export async function queryFactoryPair(assetInfos: Extract<FactoryQueryMsg, { pair: unknown }>["pair"]["asset_infos"]): Promise<PairInfo> {
  if (isE2EMode()) throw new Error("Pair was not found");
  return queryContractSmart(dexRegistry.factory, { pair: { asset_infos: assetInfos } } satisfies FactoryQueryMsg);
}

export async function querySwapSimulation(
  pairAddress: string,
  offerAsset: RegistryAsset,
  askAsset: RegistryAsset,
  amount: string,
): Promise<SimulationResponse> {
  if (isE2EMode()) return e2eSwapSimulation(amount);
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
  if (isE2EMode()) return e2eReverseSwapSimulation(askAmount);
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
  if (isE2EMode()) return e2eRouterSimulation(offerAmount);
  if (!dexRegistry.router) throw new Error("Router contract is not configured");
  return queryContractSmart(dexRegistry.router, {
    simulate_swap_operations: {
      offer_amount: offerAmount,
      operations,
    },
  } satisfies RouterQueryMsg);
}

export async function queryRouterReverseSimulation(operations: SwapOperation[], askAmount: string): Promise<SimulateSwapOperationsResponse> {
  if (isE2EMode()) return e2eRouterSimulation(askAmount);
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
