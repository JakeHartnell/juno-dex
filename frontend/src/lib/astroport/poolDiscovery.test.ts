import { describe, expect, it, vi } from "vitest";
import type { AssetInfo, PairInfo } from "../generated/Factory.types";
import { mergeDiscoveredPools, queryAllFactoryPairs } from "./poolDiscovery";
import { dexRegistry, type RegistryPool } from "../../config/registry";

const native = (denom: string): AssetInfo => ({ native_token: { denom } });
const token = (contract_addr: string): AssetInfo => ({ token: { contract_addr } });

function pair(contract_addr: string, asset_infos: AssetInfo[], pair_type: PairInfo["pair_type"] = { xyk: {} }): PairInfo {
  return {
    asset_infos,
    contract_addr,
    liquidity_token: `factory/${contract_addr}/astroport/share`,
    pair_type,
  };
}

describe("factory pool discovery", () => {
  it("paginates factory pairs with start_after from the previous page", async () => {
    const first = pair("juno1first000000000000000000000000000000000000", [native("ujuno"), native("ufoo")]);
    const second = pair("juno1second00000000000000000000000000000000000", [native("ujuno"), native("ubar")]);
    const third = pair("juno1third000000000000000000000000000000000000", [native("ujuno"), native("ubaz")]);
    const query = vi.fn()
      .mockResolvedValueOnce({ pairs: [first, second] })
      .mockResolvedValueOnce({ pairs: [third] });

    await expect(queryAllFactoryPairs(query, 2)).resolves.toEqual([first, second, third]);
    expect(query).toHaveBeenNthCalledWith(1, { pairs: { limit: 2 } });
    expect(query).toHaveBeenNthCalledWith(2, { pairs: { start_after: second.asset_infos, limit: 2 } });
  });

  it("overlays curated metadata and marks unknown factory pools unverified", () => {
    const curated: RegistryPool = {
      id: "curated-pool",
      label: "Curated JUNO / FOO",
      pair: "juno1curated0000000000000000000000000000000000",
      lpToken: "factory/juno1curated0000000000000000000000000000000000/astroport/share",
      type: "xyk",
      feeBps: 30,
      assets: [
        { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 },
        { kind: "native", id: "ufoo", symbol: "FOO", decimals: 6 },
      ],
      explorer: `${dexRegistry.explorerBaseUrl}/wasm/contract/juno1curated0000000000000000000000000000000000`,
      enabled: true,
      featured: true,
      notes: "curated note",
    };

    const pools = mergeDiscoveredPools([
      pair(curated.pair, [native("ujuno"), native("ufoo")]),
      pair("juno1unknown0000000000000000000000000000000000", [native("ujuno"), token("juno1token000000000000000000000000000000000000")], { stable: {} }),
    ], [curated]);

    expect(pools).toHaveLength(2);
    expect(pools[0]).toMatchObject({ id: "curated-pool", label: "Curated JUNO / FOO", verified: true, source: "registry", featured: true });
    expect(pools[1]).toMatchObject({ pair: "juno1unknown0000000000000000000000000000000000", type: "stable", verified: false, source: "factory", enabled: true });
    expect(pools[1].assets[1]).toMatchObject({ kind: "cw20", id: "juno1token000000000000000000000000000000000000", decimals: 6 });
  });

  it("keeps curated pools as fallback when factory discovery misses them and skips unsupported custom types", () => {
    const curated = { ...dexRegistry.pools[0], verified: false };
    const pools = mergeDiscoveredPools([
      pair("juno1skip000000000000000000000000000000000000", [native("ujuno"), native("uskip")], { custom: "other" }),
      pair("juno1cl00000000000000000000000000000000000000", [native("ujuno"), native("ucl")], { custom: "concentrated" }),
    ], [curated]);

    expect(pools.some((pool) => pool.pair === curated.pair && pool.verified === false)).toBe(true);
    expect(pools.some((pool) => pool.pair === "juno1skip000000000000000000000000000000000000")).toBe(false);
    expect(pools.find((pool) => pool.pair === "juno1cl00000000000000000000000000000000000000")?.type).toBe("concentrated");
  });
});
