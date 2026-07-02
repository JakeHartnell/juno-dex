import { dexRegistry, enabledPools, type RegistryAsset, type RegistryPool } from "../../config/registry";
import { resolveAssetMetadata } from "../assets/assetMetadata";
import type { AssetInfo, PairConfig, PairInfo, PairsResponse } from "../generated/Factory.types";

export const FACTORY_PAIRS_PAGE_LIMIT = 30;

export type FactoryPairsQuery = (message: { pairs: { start_after?: AssetInfo[]; limit: number } }) => Promise<PairsResponse>;

export type DiscoveredRegistryPool = RegistryPool & {
  source: "registry" | "factory";
  verified: boolean;
};

function pairTypeName(pairType: PairInfo["pair_type"]): RegistryPool["type"] | undefined {
  if ("xyk" in pairType) return "xyk";
  if ("stable" in pairType) return "stable";
  if ("custom" in pairType && /concentrated/i.test(pairType.custom)) return "concentrated";
  return undefined;
}

function pairTypeKey(pairType: PairInfo["pair_type"] | PairConfig["pair_type"]): string | undefined {
  if ("xyk" in pairType) return "xyk";
  if ("stable" in pairType) return "stable";
  if ("custom" in pairType) return `custom:${pairType.custom.toLowerCase()}`;
  return undefined;
}

export function factoryFeeBpsByPairType(pairConfigs: PairConfig[] = []): Map<string, number> {
  const entries = pairConfigs
    .map((config) => [pairTypeKey(config.pair_type), config.total_fee_bps] as const)
    .filter((entry): entry is readonly [string, number] => Boolean(entry[0]));
  return new Map(entries);
}

function assetId(assetInfo: AssetInfo): string {
  if ("native_token" in assetInfo) return assetInfo.native_token.denom;
  return assetInfo.token.contract_addr;
}

function assetKind(assetInfo: AssetInfo): RegistryAsset["kind"] {
  if ("token" in assetInfo) return "cw20";
  return assetInfo.native_token.denom.startsWith("ibc/") ? "ibc" : "native";
}

function fallbackAsset(assetInfo: AssetInfo): RegistryAsset {
  const id = assetId(assetInfo);
  const { source: _source, ...metadata } = resolveAssetMetadata(id, { kind: assetKind(assetInfo), id });
  return metadata;
}

function curatedKey(pool: RegistryPool): string {
  return pool.pair;
}

function discoveredKey(pair: PairInfo): string {
  return pair.contract_addr;
}

export async function queryAllFactoryPairs(queryPairs: FactoryPairsQuery, pageLimit = FACTORY_PAIRS_PAGE_LIMIT): Promise<PairInfo[]> {
  const pairs: PairInfo[] = [];
  let startAfter: AssetInfo[] | undefined;

  for (;;) {
    const response = await queryPairs({ pairs: { ...(startAfter ? { start_after: startAfter } : {}), limit: pageLimit } });
    pairs.push(...response.pairs);
    if (response.pairs.length < pageLimit) return pairs;
    startAfter = response.pairs.at(-1)?.asset_infos;
    if (!startAfter) return pairs;
  }
}

export function mergeDiscoveredPools(
  discoveredPairs: PairInfo[],
  curatedPools: RegistryPool[] = enabledPools,
  feeBpsByPairType: Map<string, number> = new Map(),
): DiscoveredRegistryPool[] {
  const curatedByPair = new Map(curatedPools.map((pool) => [curatedKey(pool), pool]));
  const merged = new Map<string, DiscoveredRegistryPool>();

  for (const pair of discoveredPairs) {
    const type = pairTypeName(pair.pair_type);
    if (!type || pair.asset_infos.length !== 2) continue;

    const curated = curatedByPair.get(discoveredKey(pair));
    const fallbackAssets = [fallbackAsset(pair.asset_infos[0]), fallbackAsset(pair.asset_infos[1])] as [RegistryAsset, RegistryAsset];
    const assets = curated?.assets ?? fallbackAssets;
    const label = curated?.label ?? `${assets.map((asset) => asset.symbol).join(" / ")} (${type.toUpperCase()})`;

    merged.set(pair.contract_addr, {
      id: curated?.id ?? `factory-${pair.contract_addr}`,
      label,
      pair: pair.contract_addr,
      lpToken: curated?.lpToken ?? pair.liquidity_token,
      type: curated?.type ?? type,
      feeBps: curated?.feeBps ?? feeBpsByPairType.get(pairTypeKey(pair.pair_type) ?? "") ?? 0,
      assets,
      explorer: curated?.explorer ?? `${dexRegistry.explorerBaseUrl}/wasm/contract/${pair.contract_addr}`,
      enabled: curated?.enabled ?? true,
      featured: curated?.featured,
      notes: curated?.notes ?? "Discovered from the Astroport factory. Metadata is unverified; verify denoms and contract addresses before trading or providing liquidity.",
      source: curated ? "registry" : "factory",
      verified: Boolean(curated),
    });
  }

  for (const curated of curatedPools) {
    if (!merged.has(curated.pair)) {
      merged.set(curated.pair, { ...curated, source: "registry", verified: true });
    }
  }

  return Array.from(merged.values()).filter((pool) => pool.enabled).sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || a.label.localeCompare(b.label));
}
