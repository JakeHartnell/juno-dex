import { describe, expect, it } from "vitest";
import { DEFAULT_START_HEIGHT, loadConfig } from "../src/config.js";

describe("config", () => {
  it("loads sane defaults", () => {
    const previous = { ...process.env };
    delete process.env.DATABASE_URL;
    delete process.env.START_HEIGHT;
    try {
      const config = loadConfig();
      expect(config.chainId).toBe("juno-1");
      expect(config.startHeight).toBe(DEFAULT_START_HEIGHT);
      expect(config.batchSize).toBeGreaterThan(0);
      expect(config.wsUrl).toContain("websocket");
      expect(config.priceProviderName).toBe("provider");
      expect(config.priceCacheTtlMs).toBe(300_000);
      expect(config.priceAllowStale).toBe(true);
      expect(config.apiPort).toBe(8787);
    } finally {
      process.env = previous;
    }
  });

  it("validates integer values", () => {
    const previous = process.env.START_HEIGHT;
    process.env.START_HEIGHT = "not-a-number";
    expect(() => loadConfig()).toThrow(/START_HEIGHT/);
    if (previous === undefined) delete process.env.START_HEIGHT;
    else process.env.START_HEIGHT = previous;
  });
});
