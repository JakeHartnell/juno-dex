import chainRegistryJson from "../../data/chain-registry-assets.juno-1.json";
import type { RegistryAsset } from "../../config/registry";

export type ChainRegistryAsset = {
  denom: string;
  aliases?: string[];
  kind: "native" | "ibc" | "cw20" | "factory";
  symbol: string;
  name?: string;
  display?: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
  denomTrace?: string;
  trace?: {
    path?: string;
    channelId?: string;
    counterpartyChainName?: string;
    counterpartyBaseDenom?: string;
    counterpartyChannelId?: string;
  };
};

type ChainRegistryAssetList = {
  chainId: "juno-1";
  source: string;
  generatedAt: string;
  assets: ChainRegistryAsset[];
};

export type ResolvedAssetMetadata = RegistryAsset & {
  name?: string;
  display?: string;
  coingeckoId?: string;
  trace?: ChainRegistryAsset["trace"];
  source: "chain-registry" | "fallback";
};

export const DEFAULT_DECIMALS = 6;
const IBC_HASH_PATTERN = /^ibc\/[0-9A-Fa-f]{64}$/;
const assetList = chainRegistryJson as ChainRegistryAssetList;

function normalizeKind(kind: ChainRegistryAsset["kind"], denom: string): RegistryAsset["kind"] {
  if (kind === "cw20") return "cw20";
  if (kind === "ibc" || denom.startsWith("ibc/")) return "ibc";
  return "native";
}

function fallbackSymbol(denom: string): string {
  if (denom === "ujuno") return "JUNO";
  if (IBC_HASH_PATTERN.test(denom)) return `${denom.slice(0, 12)}…${denom.slice(-6)}`;
  const tail = denom.split("/").filter(Boolean).at(-1) ?? denom;
  return tail.length > 18 ? `${tail.slice(0, 8)}…${tail.slice(-6)}` : tail.toUpperCase();
}

function fallbackName(denom: string): string | undefined {
  if (denom.startsWith("ibc/")) return "Unknown IBC asset";
  if (denom.startsWith("factory/")) return "TokenFactory asset";
  return undefined;
}

function fromChainRegistry(asset: ChainRegistryAsset): ResolvedAssetMetadata {
  return {
    kind: normalizeKind(asset.kind, asset.denom),
    id: asset.denom,
    symbol: asset.symbol,
    name: asset.name,
    display: asset.display,
    decimals: asset.decimals,
    logoURI: asset.logoURI,
    denomTrace: asset.denomTrace,
    coingeckoId: asset.coingeckoId,
    trace: asset.trace,
    source: "chain-registry",
  };
}

const metadataByDenom = new Map<string, ResolvedAssetMetadata>();
for (const asset of assetList.assets) {
  const resolved = fromChainRegistry(asset);
  metadataByDenom.set(asset.denom, resolved);
  for (const alias of asset.aliases ?? []) metadataByDenom.set(alias, resolved);
}

export function getChainRegistryAsset(denom: string): ResolvedAssetMetadata | undefined {
  return metadataByDenom.get(denom);
}

export function resolveAssetMetadata(denom: string, overrides: Partial<RegistryAsset> = {}): ResolvedAssetMetadata {
  const base = metadataByDenom.get(denom);
  const resolved: ResolvedAssetMetadata = base
    ? { ...base, id: denom }
    : {
      kind: denom.startsWith("ibc/") ? "ibc" : denom.match(/^juno1[ac-hj-np-z02-9]{38,58}$/) ? "cw20" : "native",
      id: denom,
      symbol: fallbackSymbol(denom),
      name: fallbackName(denom),
      decimals: DEFAULT_DECIMALS,
      source: "fallback",
    };

  return {
    ...resolved,
    ...overrides,
    id: overrides.id ?? denom,
    kind: overrides.kind ?? resolved.kind,
    symbol: overrides.symbol ?? resolved.symbol,
    decimals: overrides.decimals ?? resolved.decimals,
    denomTrace: overrides.denomTrace ?? resolved.denomTrace,
    logoURI: overrides.logoURI ?? resolved.logoURI,
  };
}

export function mergeAssetMetadata(asset: RegistryAsset): RegistryAsset {
  const metadata = resolveAssetMetadata(asset.id, asset);
  const { source: _source, ...metadataFields } = metadata;
  return {
    ...metadataFields,
    ...asset,
    name: asset.name ?? metadata.name,
    display: asset.display ?? metadata.display,
    logoURI: asset.logoURI ?? metadata.logoURI,
    denomTrace: asset.denomTrace ?? metadata.denomTrace,
    coingeckoId: asset.coingeckoId ?? metadata.coingeckoId,
    trace: asset.trace ?? metadata.trace,
  };
}

export function getChainRegistryAssets(): ResolvedAssetMetadata[] {
  return Array.from(new Map(assetList.assets.map((asset) => [asset.denom, fromChainRegistry(asset)])).values());
}
