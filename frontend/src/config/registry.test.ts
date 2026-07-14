import { describe, expect, it } from "vitest";
import { applyDexRegistryEnvOverrides, dexRegistry, enabledPools, isPoolTradeable, parseDexRegistry } from "./registry";

describe("dex registry", () => {
  it("loads the committed juno-1 registry", () => {
    expect(dexRegistry.chainId).toBe("juno-1");
    expect(dexRegistry.pools).toHaveLength(5);
    expect(dexRegistry.pools[0].type).toBe("xyk");
    expect(dexRegistry.pools.every((pool) => pool.status === "active" && pool.verified === true)).toBe(true);
    expect(enabledPools).toHaveLength(5);
    expect(dexRegistry.pools.map((pool) => pool.id)).toEqual(expect.arrayContaining([
      "season0-twolf-juno",
      "season0-traw-juno",
      "season0-tahab-juno",
      "season0-tahab-tfud",
    ]));
  });

  it("requires explicit pool lifecycle and verification metadata", () => {
    const pool = dexRegistry.pools[0];
    const { status: _status, ...withoutStatus } = pool;
    const { verified: _poolVerified, ...withoutPoolVerification } = pool;
    const { verified: _assetVerified, ...withoutAssetVerification } = pool.assets[0];

    expect(() => parseDexRegistry({ ...dexRegistry, pools: [withoutStatus] })).toThrow(/status/i);
    expect(() => parseDexRegistry({ ...dexRegistry, pools: [withoutPoolVerification] })).toThrow(/verified/i);
    expect(() => parseDexRegistry({
      ...dexRegistry,
      pools: [{ ...pool, assets: [withoutAssetVerification, pool.assets[1]] }],
    })).toThrow(/verified/i);
  });

  it("allows normal trading only for enabled active pools", () => {
    const pool = dexRegistry.pools[0];
    expect(isPoolTradeable(pool)).toBe(true);
    expect(isPoolTradeable({ ...pool, status: "experimental" })).toBe(false);
    expect(isPoolTradeable({ ...pool, status: "active", enabled: false })).toBe(false);
    expect(isPoolTradeable({ ...pool, status: "active", assets: [{ ...pool.assets[0], blocked: true }, pool.assets[1]] })).toBe(false);
  });

  it("validates explicit blocked asset metadata", () => {
    const pool = dexRegistry.pools[0];
    expect(parseDexRegistry({
      ...dexRegistry,
      pools: [{ ...pool, assets: [{ ...pool.assets[0], blocked: true }, pool.assets[1]] }],
    }).pools[0].assets[0].blocked).toBe(true);
    expect(() => parseDexRegistry({
      ...dexRegistry,
      pools: [{ ...pool, assets: [{ ...pool.assets[0], blocked: "yes" }, pool.assets[1]] }],
    })).toThrow(/blocked/i);
  });

  it("rejects placeholder contract addresses", () => {
    const invalid = {
      ...dexRegistry,
      factory: "juno1replacefactory000000000000000000000000000000",
    };

    expect(() => parseDexRegistry(invalid)).toThrow(/placeholder/i);
  });

  it("rejects non-juno chain registries", () => {
    expect(() => parseDexRegistry({ ...dexRegistry, chainId: "uni-7" })).toThrow(/juno-1/);
  });

  it("accepts curated stable and concentrated pools without allowing unknown pool types", () => {
    const stableRegistry = {
      ...dexRegistry,
      pools: [{ ...dexRegistry.pools[0], id: "stable-pool", type: "stable" }],
    };
    const concentratedRegistry = {
      ...dexRegistry,
      pools: [{ ...dexRegistry.pools[0], id: "concentrated-pool", type: "concentrated" }],
    };

    expect(parseDexRegistry(stableRegistry).pools[0].type).toBe("stable");
    expect(parseDexRegistry(concentratedRegistry).pools[0].type).toBe("concentrated");
    expect(() => parseDexRegistry({ ...dexRegistry, pools: [{ ...dexRegistry.pools[0], type: "placeholder" }] })).toThrow(/xyk, stable, or concentrated/);
  });

  it("allows deploy environments to override public endpoints", () => {
    import.meta.env.VITE_DEX_RPC_URL = "https://rpc.host.invalid";
    import.meta.env.VITE_DEX_REST_URL = "https://rest.host.invalid";
    import.meta.env.VITE_DEX_EXPLORER_URL = "https://explorer.host.invalid/juno";

    const overridden = applyDexRegistryEnvOverrides(dexRegistry);

    expect(overridden.rpcEndpoint).toBe("https://rpc.host.invalid");
    expect(overridden.restEndpoint).toBe("https://rest.host.invalid");
    expect(overridden.explorerBaseUrl).toBe("https://explorer.host.invalid/juno");

    delete import.meta.env.VITE_DEX_RPC_URL;
    delete import.meta.env.VITE_DEX_REST_URL;
    delete import.meta.env.VITE_DEX_EXPLORER_URL;
  });
});
