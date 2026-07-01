import { describe, expect, it } from "vitest";
import { dexRegistry, parseDexRegistry } from "./registry";

describe("dex registry", () => {
  it("loads the committed juno-1 registry", () => {
    expect(dexRegistry.chainId).toBe("juno-1");
    expect(dexRegistry.pools).toHaveLength(1);
    expect(dexRegistry.pools[0].type).toBe("xyk");
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
});
