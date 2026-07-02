import { dexRegistry, type RegistryAsset, type RegistryPool } from "../config/registry";
import { getChainRegistryAssets, resolveAssetMetadata } from "./assets/assetMetadata";
import { toAssetInfo } from "./astroport/assetInfo";
import type { ExecuteMsg as FactoryExecuteMsg, PairConfig, PairInfo, PairType } from "./generated/Factory.types";
import { assessAssetRisk, type RiskAssessment } from "./risk";

export type CreatePoolType = "xyk" | "stable" | "concentrated";

export type CreatePoolConfigOption = {
  id: CreatePoolType;
  label: string;
  pairType: PairType;
  feeBps?: number;
  disabled?: boolean;
  permissioned?: boolean;
  unsupportedReason?: string;
};

export type CreatePoolValidation = {
  isValid: boolean;
  error?: string;
  warnings: string[];
  requiresAcknowledgement: boolean;
  risk: RiskAssessment;
};

const typeLabels: Record<CreatePoolType, string> = {
  xyk: "XYK constant product",
  stable: "Stable swap",
  concentrated: "PCL / concentrated liquidity",
};

export function pairTypeKey(pairType: PairType): CreatePoolType | undefined {
  if ("xyk" in pairType) return "xyk";
  if ("stable" in pairType) return "stable";
  if ("custom" in pairType && /concentrated|pcl/i.test(pairType.custom)) return "concentrated";
  return undefined;
}

function defaultPairType(id: CreatePoolType): PairType {
  if (id === "xyk") return { xyk: {} };
  if (id === "stable") return { stable: {} };
  return { custom: "concentrated" };
}

export function createPoolOptions(pairConfigs: PairConfig[] | undefined): CreatePoolConfigOption[] {
  const byType = new Map<CreatePoolType, PairConfig>();
  for (const config of pairConfigs ?? []) {
    const key = pairTypeKey(config.pair_type);
    if (key && !byType.has(key)) byType.set(key, config);
  }

  return (["xyk", "stable", "concentrated"] as const).map((id) => {
    const config = byType.get(id);
    const unavailable = pairConfigs && !config;
    return {
      id,
      label: typeLabels[id],
      pairType: config?.pair_type ?? defaultPairType(id),
      feeBps: config?.total_fee_bps,
      disabled: unavailable || config?.is_disabled || config?.permissioned,
      permissioned: config?.permissioned,
      unsupportedReason: unavailable
        ? "This pool type is not configured in the live factory."
        : config?.is_disabled
          ? "This pool type is disabled in the live factory."
          : config?.permissioned
            ? "This pool type requires factory permission and cannot be created permissionlessly."
            : undefined,
    };
  });
}

export function buildCreatePoolAssets(pools: RegistryPool[] = []): Array<RegistryAsset & { verified?: boolean; poolCount?: number }> {
  const byId = new Map<string, RegistryAsset & { verified?: boolean; poolCount?: number }>();
  for (const asset of getChainRegistryAssets()) {
    const { source: _source, ...metadata } = asset;
    byId.set(metadata.id, { ...metadata, verified: true, poolCount: 0 });
  }
  for (const pool of pools) {
    for (const asset of pool.assets) {
      const existing = byId.get(asset.id);
      byId.set(asset.id, {
        ...existing,
        ...asset,
        logoURI: existing?.logoURI ?? asset.logoURI,
        verified: existing?.verified ?? pool.verified ?? pool.source !== "factory",
        poolCount: (existing?.poolCount ?? 0) + 1,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => Number(Boolean(b.verified)) - Number(Boolean(a.verified)) || a.symbol.localeCompare(b.symbol));
}

export function makeCustomAsset(input: { kind: RegistryAsset["kind"]; id: string; symbol?: string; decimals?: number }): RegistryAsset {
  const id = input.id.trim();
  const metadata = resolveAssetMetadata(id, { kind: input.kind, id });
  const { source: _source, ...asset } = metadata;
  return {
    ...asset,
    kind: input.kind,
    id,
    symbol: input.symbol?.trim() || asset.symbol,
    decimals: Number.isInteger(input.decimals) && input.decimals! >= 0 ? input.decimals! : asset.decimals,
    verified: false,
  };
}

export function createPairMessage(assets: [RegistryAsset, RegistryAsset], pairType: PairType, initParams?: string | null): FactoryExecuteMsg {
  return {
    create_pair: {
      pair_type: pairType,
      asset_infos: [toAssetInfo(assets[0]), toAssetInfo(assets[1])],
      init_params: initParams || undefined,
    },
  } satisfies FactoryExecuteMsg;
}

function assetKey(asset: RegistryAsset): string {
  return `${asset.kind}:${asset.id}`;
}

export function poolMatchesAssets(pool: RegistryPool, assets: [RegistryAsset, RegistryAsset]) {
  const poolIds = pool.assets.map((asset) => asset.id).sort().join("|");
  const selectedIds = assets.map((asset) => asset.id).sort().join("|");
  return poolIds === selectedIds;
}

export function validateCreatePool(input: {
  assets: [RegistryAsset | undefined, RegistryAsset | undefined];
  option: CreatePoolConfigOption | undefined;
  existingPair?: PairInfo | RegistryPool | null;
  riskAcknowledged: boolean;
}): CreatePoolValidation {
  const warnings: string[] = [
    "Pool creation is permissionless and irreversible once accepted by the factory.",
    "Create only assets whose denoms or CW20 contract addresses you have independently verified.",
  ];
  const [assetA, assetB] = input.assets;
  if (!assetA || !assetB) return { isValid: false, error: "Choose two assets", warnings, requiresAcknowledgement: false, risk: { verified: false, badges: [], requiresAcknowledgement: false } };

  const riskBadges = [...assessAssetRisk(assetA, { inheritedVerified: assetA.verified }).badges, ...assessAssetRisk(assetB, { inheritedVerified: assetB.verified }).badges];
  const risk: RiskAssessment = {
    verified: Boolean(assetA.verified && assetB.verified),
    badges: riskBadges.filter((badge, index, all) => all.findIndex((candidate) => candidate.id === badge.id) === index),
    requiresAcknowledgement: riskBadges.some((badge) => badge.requiresAcknowledgement),
  };

  if (assetKey(assetA) === assetKey(assetB)) return { isValid: false, error: "Choose two different assets", warnings, requiresAcknowledgement: risk.requiresAcknowledgement, risk };
  if (!input.option) return { isValid: false, error: "Choose a pool type", warnings, requiresAcknowledgement: risk.requiresAcknowledgement, risk };
  if (input.option.disabled) return { isValid: false, error: input.option.unsupportedReason ?? "Pool type is not available", warnings, requiresAcknowledgement: risk.requiresAcknowledgement, risk };
  if (input.option.id === "stable" && assetA.decimals !== assetB.decimals) {
    warnings.push("Stable pools are intended for closely-pegged assets. Different decimals require extra review.");
  }
  if (input.option.id === "concentrated") {
    warnings.push("PCL pools may require custom parameters on some deployments; this flow uses the factory default init params.");
  }
  if (input.existingPair) return { isValid: false, error: "A pool already exists for these assets", warnings, requiresAcknowledgement: risk.requiresAcknowledgement, risk };
  if (risk.requiresAcknowledgement && !input.riskAcknowledged) return { isValid: false, error: "Acknowledge unverified asset risk", warnings, requiresAcknowledgement: true, risk };
  return { isValid: true, warnings, requiresAcknowledgement: risk.requiresAcknowledgement, risk };
}

export function extractCreatedPairAddress(result: unknown): string | undefined {
  const events = (result as { events?: Array<{ type?: string; attributes?: Array<{ key?: string; value?: string }> }> })?.events ?? [];
  const candidates: string[] = [];
  for (const event of events) {
    for (const attr of event.attributes ?? []) {
      const key = attr.key ?? "";
      const value = attr.value;
      if (!value?.startsWith("juno1") || value === dexRegistry.factory) continue;
      if (/pair.*(addr|contract)|contract_addr/.test(key)) candidates.unshift(value);
      else if (/_contract_address/.test(key)) candidates.push(value);
    }
  }
  if (candidates[0]) return candidates[0];
  const logs = (result as { logs?: Array<{ events?: Array<{ attributes?: Array<{ key?: string; value?: string }> }> }> })?.logs ?? [];
  for (const log of logs) {
    const address = extractCreatedPairAddress({ events: log.events });
    if (address) return address;
  }
  return undefined;
}
