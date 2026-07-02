import { describe, expect, it } from "vitest";
import type { RegistryPool } from "../config/registry";
import { assessAssetRisk, assessPoolRisk, assessRouteRisk, riskSummary } from "./risk";

const verifiedPool: RegistryPool = {
  id: "verified",
  label: "JUNO / ATOM",
  pair: "juno1pair",
  lpToken: "factory/juno1pair/lp",
  type: "xyk",
  feeBps: 30,
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6, logoURI: "https://example.com/juno.svg", verified: true },
    { kind: "ibc", id: "ibc/atom", symbol: "ATOM", decimals: 6, logoURI: "https://example.com/atom.svg", verified: true },
  ],
  explorer: "https://example.com/pair",
  enabled: true,
  source: "registry",
  verified: true,
};

const factoryPool: RegistryPool = {
  ...verifiedPool,
  id: "factory",
  label: "UNKNOWN / TEST",
  source: "factory",
  verified: false,
  assets: [
    { kind: "native", id: "factory/juno1creator/unknown", symbol: "UNKNOWN", decimals: 6 },
    { kind: "ibc", id: "uatom", symbol: "BADATOM", decimals: 6 },
  ],
};

describe("risk classification", () => {
  it("marks curated assets and pools verified", () => {
    const assetRisk = assessAssetRisk(verifiedPool.assets[0], { inheritedVerified: true });
    expect(assetRisk.verified).toBe(true);
    expect(assetRisk.requiresAcknowledgement).toBe(false);
    expect(assetRisk.badges.map((badge) => badge.id)).toContain("verified");

    const poolRisk = assessPoolRisk(verifiedPool);
    expect(poolRisk.verified).toBe(true);
    expect(poolRisk.requiresAcknowledgement).toBe(false);
    expect(riskSummary(poolRisk)).toBe("Verified curated pool and assets.");
  });

  it("flags factory-discovered assets, fallback metadata, and denom mismatches", () => {
    const risk = assessPoolRisk(factoryPool);
    expect(risk.requiresAcknowledgement).toBe(true);
    expect(risk.badges.map((badge) => badge.id)).toEqual(expect.arrayContaining([
      "unverified-pool",
      "unverified-token",
      "factory-discovered",
      "missing-logo",
      "decimals-fallback",
      "denom-mismatch",
    ]));
  });

  it("adds thin liquidity warnings when reserve data is available", () => {
    const risk = assessPoolRisk(verifiedPool, { assets: [{ amount: "999999" }, { amount: "1000000" }] });
    expect(risk.badges.map((badge) => badge.id)).toContain("thin-liquidity");
  });

  it("adds pool-type caveat badges for stable and concentrated pools", () => {
    const stableRisk = assessPoolRisk({ ...verifiedPool, type: "stable" });
    const pclRisk = assessPoolRisk({ ...factoryPool, type: "concentrated" });

    expect(stableRisk.badges.map((badge) => badge.id)).toEqual(expect.arrayContaining(["pool-type-stable", "caveated-liquidity-math"]));
    expect(stableRisk.requiresAcknowledgement).toBe(false);
    expect(pclRisk.badges.map((badge) => badge.id)).toEqual(expect.arrayContaining(["pool-type-concentrated", "caveated-liquidity-math"]));
    expect(pclRisk.requiresAcknowledgement).toBe(true);
  });

  it("requires route acknowledgement when any hop is unverified", () => {
    const risk = assessRouteRisk({
      id: "route",
      hops: [{ pool: factoryPool, offerAsset: factoryPool.assets[0], askAsset: factoryPool.assets[1] }],
      operations: [],
    });
    expect(risk.requiresAcknowledgement).toBe(true);
  });
});
