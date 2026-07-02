import type { RegistryAsset, RegistryPool } from "../config/registry";
import type { SwapRoute } from "./astroport/routes";
import { getPoolTypeMetadata } from "./pools/poolTypes";

export type RiskSeverity = "ok" | "info" | "warning" | "danger";

export type RiskBadge = {
  id: string;
  label: string;
  severity: RiskSeverity;
  description: string;
  requiresAcknowledgement?: boolean;
};

export type RiskAssessment = {
  verified: boolean;
  badges: RiskBadge[];
  requiresAcknowledgement: boolean;
};

export const THIN_LIQUIDITY_WHOLE_TOKEN_THRESHOLD = 1n;

const DENYLISTED_DENOMS = new Set<string>([
  // Intentionally empty for launch. Keep this central so operators can add known-bad
  // denoms without changing transaction components.
]);

function uniqueBadges(badges: RiskBadge[]): RiskBadge[] {
  const seen = new Set<string>();
  return badges.filter((badge) => {
    if (seen.has(badge.id)) return false;
    seen.add(badge.id);
    return true;
  });
}

function withRequiresAcknowledgement(badges: RiskBadge[], verified: boolean): RiskAssessment {
  const unique = uniqueBadges(badges);
  return {
    verified,
    badges: unique,
    requiresAcknowledgement: unique.some((badge) => badge.requiresAcknowledgement),
  };
}

function hasKnownBadDenom(asset: RegistryAsset): boolean {
  return DENYLISTED_DENOMS.has(asset.id) || Boolean(asset.denomTrace && DENYLISTED_DENOMS.has(asset.denomTrace));
}

function hasDenomMismatch(asset: RegistryAsset): boolean {
  if (asset.kind === "ibc") return !asset.id.startsWith("ibc/") || Boolean(asset.denomTrace && asset.denomTrace.startsWith("ibc/"));
  if (asset.kind === "native") return asset.id.startsWith("ibc/") || asset.id.startsWith("juno1");
  if (asset.kind === "cw20") return !asset.id.startsWith("juno1");
  return false;
}

export function assessAssetRisk(asset: RegistryAsset & { verified?: boolean }, options: { inheritedVerified?: boolean; factoryDiscovered?: boolean } = {}): RiskAssessment {
  const verified = Boolean(asset.verified ?? options.inheritedVerified);
  const badges: RiskBadge[] = [];

  if (verified) {
    badges.push({ id: "verified", label: "Verified", severity: "ok", description: "Curated registry metadata." });
  } else {
    badges.push({ id: "unverified-token", label: "Unverified", severity: "warning", description: "This asset is not in the curated verified list.", requiresAcknowledgement: true });
  }

  if (options.factoryDiscovered && !verified) {
    badges.push({ id: "factory-discovered", label: "Factory", severity: "info", description: "Discovered from factory state rather than curated metadata." });
  }

  if (hasKnownBadDenom(asset)) {
    badges.push({ id: "denylisted", label: "Blocked denom", severity: "danger", description: "This denom is on the known-bad denylist.", requiresAcknowledgement: true });
  }

  if (hasDenomMismatch(asset)) {
    badges.push({ id: "denom-mismatch", label: "Denom mismatch", severity: "danger", description: "Asset kind and denom/address shape do not match expectations.", requiresAcknowledgement: true });
  }

  if (!asset.logoURI) {
    badges.push({ id: "missing-logo", label: "No logo", severity: verified ? "info" : "warning", description: "No curated logo is available for this asset." });
  }

  if (!verified && asset.decimals === 6) {
    badges.push({ id: "decimals-fallback", label: "Decimals fallback", severity: "warning", description: "Decimals may be a 6-decimal fallback for unverified factory metadata." });
  }

  return withRequiresAcknowledgement(badges, verified);
}

function isThinReserve(amount: string | undefined, decimals: number): boolean {
  if (!amount || !/^\d+$/.test(amount)) return false;
  return BigInt(amount) < THIN_LIQUIDITY_WHOLE_TOKEN_THRESHOLD * 10n ** BigInt(decimals);
}

export function assessPoolRisk(pool: RegistryPool, reserves?: { assets?: Array<{ amount?: string }> }): RiskAssessment {
  const verified = pool.verified !== false && pool.source !== "factory";
  const badges: RiskBadge[] = [];
  const poolType = getPoolTypeMetadata(pool.type);

  badges.push(verified
    ? { id: "verified-pool", label: "Verified pool", severity: "ok", description: "Pool is in the curated verified pool list." }
    : { id: "unverified-pool", label: "Unverified pool", severity: "warning", description: "Factory-discovered or uncurated pool. Verify pair and denoms before transacting.", requiresAcknowledgement: true });

  badges.push({
    id: `pool-type-${pool.type}`,
    label: poolType.shortLabel,
    severity: pool.type === "xyk" ? "info" : "warning",
    description: poolType.description,
    requiresAcknowledgement: pool.type === "concentrated" && !verified,
  });

  if (!poolType.supportsProvideSimulation || !poolType.supportsWithdrawSimulation) {
    badges.push({
      id: "caveated-liquidity-math",
      label: "Caveated liquidity math",
      severity: "warning",
      description: "The UI does not locally model this pool type's provide/withdraw invariant; unsupported actions are disabled or marked as estimates.",
    });
  }

  for (const asset of pool.assets) {
    badges.push(...assessAssetRisk(asset, { inheritedVerified: verified, factoryDiscovered: pool.source === "factory" }).badges.filter((badge) => badge.id !== "verified"));
  }

  if (reserves?.assets?.length) {
    const thinAssets = pool.assets.filter((asset, index) => isThinReserve(reserves.assets?.[index]?.amount, asset.decimals));
    if (thinAssets.length > 0) {
      badges.push({ id: "thin-liquidity", label: "Thin liquidity", severity: "warning", description: `Low reserve detected for ${thinAssets.map((asset) => asset.symbol).join(" / ")}.` });
    }
  }

  return withRequiresAcknowledgement(badges, verified);
}

export function assessRouteRisk(route: SwapRoute | undefined, reservesByPair?: Record<string, { assets?: Array<{ amount?: string }> }>): RiskAssessment {
  if (!route) return { verified: false, badges: [], requiresAcknowledgement: false };
  const badges = route.hops.flatMap((hop) => assessPoolRisk(hop.pool, reservesByPair?.[hop.pool.pair]).badges);
  const verified = route.hops.every((hop) => hop.pool.verified !== false && hop.pool.source !== "factory");
  if (route.hops.length > 1) {
    badges.push({ id: "multi-hop", label: "Multi-hop", severity: "info", description: "Route touches multiple pools; review each hop." });
  }
  if (route.hops.some((hop) => !getPoolTypeMetadata(hop.pool.type).supportsLocalPriceImpact)) {
    badges.push({ id: "contract-simulated-impact", label: "Contract-simulated impact", severity: "info", description: "Stable/PCL routes rely on contract simulation for pricing; the UI does not recompute those invariants locally." });
  }
  return withRequiresAcknowledgement(badges, verified);
}

export function riskSummary(assessment: RiskAssessment): string {
  const actionable = assessment.badges.filter((badge) => badge.severity === "warning" || badge.severity === "danger");
  if (actionable.length === 0) return "Verified curated pool and assets.";
  return actionable.map((badge) => badge.label).join(" · ");
}
