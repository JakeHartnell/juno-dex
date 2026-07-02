import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("config", () => {
  it("loads sane defaults", () => {
    const previous = { ...process.env };
    delete process.env.DATABASE_URL;
    delete process.env.START_HEIGHT;
    try {
      const config = loadConfig();
      expect(config.chainId).toBe("juno-1");
      expect(config.startHeight).toBe(1);
      expect(config.batchSize).toBeGreaterThan(0);
      expect(config.wsUrl).toContain("websocket");
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
