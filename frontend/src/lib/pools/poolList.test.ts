import { describe, expect, it } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { DEFAULT_POOL_LIST_CONTROLS, filterAndSortPools } from "./poolList";

function pool(overrides: Partial<RegistryPool> & Pick<RegistryPool, "id" | "label" | "pair" | "type" | "feeBps">): RegistryPool {
  return {
    lpToken: `${overrides.id}-lp`,
    assets: [
      { kind: "native", id: `${overrides.id}-base`, symbol: overrides.label.split(" /")[0] ?? "AAA", decimals: 6 },
      { kind: "native", id: `${overrides.id}-quote`, symbol: overrides.label.split(" /")[1] ?? "BBB", decimals: 6 },
    ],
    explorer: `https://example.com/${overrides.pair}`,
    enabled: true,
    verified: true,
    ...overrides,
  };
}

const pools = [
  pool({ id: "juno-usdc", label: "JUNO / USDC", pair: "juno1alpha", type: "xyk", feeBps: 30, featured: true }),
  pool({ id: "atom-usdc", label: "ATOM / USDC", pair: "juno1beta", type: "stable", feeBps: 5, verified: false }),
  pool({ id: "raw-wynd", label: "RAW / WYND", pair: "juno1gamma", type: "xyk", feeBps: 30 }),
];

describe("pool list filtering and sorting", () => {
  it("searches labels, symbols, denoms, and addresses", () => {
    expect(filterAndSortPools(pools, { ...DEFAULT_POOL_LIST_CONTROLS, search: "atom" }).map((candidate) => candidate.id)).toEqual(["atom-usdc"]);
    expect(filterAndSortPools(pools, { ...DEFAULT_POOL_LIST_CONTROLS, search: "juno1gamma" }).map((candidate) => candidate.id)).toEqual(["raw-wynd"]);
  });

  it("filters by type and verification", () => {
    expect(filterAndSortPools(pools, { ...DEFAULT_POOL_LIST_CONTROLS, type: "stable" }).map((candidate) => candidate.id)).toEqual(["atom-usdc"]);
    expect(filterAndSortPools(pools, { ...DEFAULT_POOL_LIST_CONTROLS, verified: "unverified" }).map((candidate) => candidate.id)).toEqual(["atom-usdc"]);
  });

  it("sorts numeric metrics with unavailable values last", () => {
    const sorted = filterAndSortPools(pools, { ...DEFAULT_POOL_LIST_CONTROLS, sortKey: "tvl", sortDirection: "desc" }, {
      juno1alpha: { tvlUsd: 1200 },
      juno1beta: { tvlUsd: 9900 },
    });

    expect(sorted.map((candidate) => candidate.id)).toEqual(["atom-usdc", "juno-usdc", "raw-wynd"]);
  });

  it("filters incentivized pools from indexer metrics", () => {
    const sorted = filterAndSortPools(pools, { ...DEFAULT_POOL_LIST_CONTROLS, incentivized: "incentivized" }, {
      juno1gamma: { incentivesApr: 8.4, incentivized: true },
    });

    expect(sorted.map((candidate) => candidate.id)).toEqual(["raw-wynd"]);
  });
});
