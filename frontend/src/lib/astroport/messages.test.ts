import { describe, expect, it } from "vitest";
import type { RegistryAsset } from "../../config/registry";
import { fromBase64, fromUtf8 } from "@cosmjs/encoding";
import { createCw20SwapSendMessage, createProvideLiquidityMessage, createSwapMessage } from "./messages";

const juno: RegistryAsset = { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 };
const testToken: RegistryAsset = { kind: "ibc", id: "ibc/test", symbol: "TEST", decimals: 6 };
const factoryToken: RegistryAsset = {
  kind: "native",
  id: "factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/junoagenttest202607010323",
  symbol: "AGENT",
  decimals: 6,
};
const cw20: RegistryAsset = { kind: "cw20", id: "juno1cw20token000000000000000000000000000000000", symbol: "CW20", decimals: 6 };

describe("createSwapMessage", () => {
  it("builds a direct pair swap payload with native funds and max spread", () => {
    const payload = createSwapMessage(juno, testToken, "1000000", "0.005");

    expect(payload).toEqual({
      msg: {
        swap: {
          offer_asset: { info: { native_token: { denom: "ujuno" } }, amount: "1000000" },
          ask_asset_info: { native_token: { denom: "ibc/test" } },
          max_spread: "0.005",
        },
      },
      funds: [{ denom: "ujuno", amount: "1000000" }],
    });
  });

  it("uses an atomic CW20 send hook instead of an unfunded pair execute", () => {
    const msg = createCw20SwapSendMessage("juno1pair", testToken, "1000000", "0.005");
    expect(msg.send).toMatchObject({ contract: "juno1pair", amount: "1000000" });
    expect(JSON.parse(fromUtf8(fromBase64(msg.send.msg)))).toEqual({
      swap: { ask_asset_info: { native_token: { denom: "ibc/test" } }, max_spread: "0.005" },
    });
  });
});

describe("createProvideLiquidityMessage", () => {
  it("keeps pair asset order in the message but sorts native funds by denom", () => {
    const payload = createProvideLiquidityMessage([juno, factoryToken], ["1000000", "2000000"], "0.005", "995000");

    expect(payload.msg.provide_liquidity.assets).toEqual([
      { info: { native_token: { denom: "ujuno" } }, amount: "1000000" },
      { info: { native_token: { denom: factoryToken.id } }, amount: "2000000" },
    ]);
    expect(payload.funds).toEqual([
      { denom: factoryToken.id, amount: "2000000" },
      { denom: "ujuno", amount: "1000000" },
    ]);
  });

  it("hard-blocks CW20 deposits until exact allowance execution is implemented", () => {
    expect(() => createProvideLiquidityMessage([juno, cw20], ["1", "1"])).toThrow(/exact allowances/i);
  });
});
