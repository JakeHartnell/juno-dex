import { describe, expect, it } from "vitest";
import { parseDexRegistry } from "../../config/registry";
import { getChainRegistryAsset, mergeAssetMetadata, resolveAssetMetadata } from "./assetMetadata";

describe("chain-registry asset metadata", () => {
  it("resolves JUNO metadata with decimals, name, and logo", () => {
    const juno = resolveAssetMetadata("ujuno");

    expect(juno.source).toBe("chain-registry");
    expect(juno.symbol).toBe("JUNO");
    expect(juno.name).toBe("Juno");
    expect(juno.decimals).toBe(6);
    expect(juno.logoURI).toMatch(/juno\.(svg|png)$/);
  });

  it("resolves IBC denom trace metadata and counterparty hints", () => {
    const atom = resolveAssetMetadata("ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9");

    expect(atom.kind).toBe("ibc");
    expect(atom.symbol).toBe("ATOM");
    expect(atom.denomTrace).toBe("transfer/channel-1/uatom");
    expect(atom.trace?.counterpartyChainName).toBe("cosmoshub");
    expect(atom.trace?.counterpartyBaseDenom).toBe("uatom");
  });

  it("falls back safely for unknown IBC denoms without inventing trace metadata", () => {
    const unknown = resolveAssetMetadata("ibc/0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF");

    expect(unknown.source).toBe("fallback");
    expect(unknown.kind).toBe("ibc");
    expect(unknown.name).toBe("Unknown IBC asset");
    expect(unknown.decimals).toBe(6);
    expect(unknown.denomTrace).toBeUndefined();
  });

  it("merges metadata into curated assets without weakening registry validation", () => {
    const curated = mergeAssetMetadata({ kind: "native", id: "ujuno", symbol: "CURATED-JUNO", decimals: 6 });

    expect(curated.symbol).toBe("CURATED-JUNO");
    expect(curated.logoURI).toBe(getChainRegistryAsset("ujuno")?.logoURI);
    expect(curated.name).toBe("Juno");
    expect(() => parseDexRegistry({ chainId: "juno-1", pools: [] })).toThrow(/chainName/);
  });
});
