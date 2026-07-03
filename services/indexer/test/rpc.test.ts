import { afterEach, describe, expect, it, vi } from "vitest";
import { JunoRestClient } from "../src/rpc.js";

afterEach(() => vi.restoreAllMocks());

describe("JunoRestClient", () => {
  it("queries pair pool state at an explicit historical height", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          assets: [
            { info: { native_token: { denom: "ujuno" } }, amount: "123" },
            { info: { token: { contract_addr: "juno1token" } }, amount: "456" },
          ],
          total_share: "789",
        },
      }),
    } as Response);

    const state = await new JunoRestClient("https://lcd.example").poolState("juno1pair", 39381355);

    expect(state).toEqual({ reserves: [{ denom: "ujuno", amount: "123" }, { denom: "juno1token", amount: "456" }], totalShare: "789" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/^https:\/\/lcd\.example\/cosmwasm\/wasm\/v1\/contract\/juno1pair\/smart\//);
    const encoded = String(url).split("/smart/")[1] ?? "";
    expect(JSON.parse(Buffer.from(decodeURIComponent(encoded), "base64").toString("utf8"))).toEqual({ pool: {} });
    expect((init as RequestInit).headers).toMatchObject({ "x-cosmos-block-height": "39381355" });
  });

  it("rejects malformed pool responses instead of fabricating reserves", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ data: { assets: [] } }) } as Response);

    await expect(new JunoRestClient("https://lcd.example").poolState("juno1pair", 1)).rejects.toThrow(/no reserves/i);
  });
});
