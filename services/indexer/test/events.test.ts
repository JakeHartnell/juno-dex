import { describe, expect, it } from "vitest";
import { attributesToRecord, normalizeBlockEvents, normalizeWasmEvent } from "../src/events.js";

const context = { chainId: "juno-1", height: 123, blockTime: "2026-07-02T00:00:00Z", txHash: "ABC", msgIndex: 0, eventIndex: 0 };
const contracts = { factoryAddress: "juno1factory", incentivesAddress: "juno1incentives" };

describe("event normalization", () => {
  it("preserves repeated attributes", () => {
    expect(attributesToRecord([
      { key: "asset_info", value: "ujuno" },
      { key: "asset_info", value: "factory/token" },
    ])).toEqual({ asset_info: ["ujuno", "factory/token"] });
  });

  it("normalizes factory pair creation events", () => {
    const event = normalizeWasmEvent({
      type: "wasm",
      attributes: [
        { key: "_contract_address", value: "juno1factory" },
        { key: "action", value: "create_pair" },
        { key: "pair_contract_addr", value: "juno1pair" },
        { key: "liquidity_token_addr", value: "factory/juno1pair/astroport/share" },
        { key: "pair_type", value: "xyk" },
        { key: "asset_info", value: "ujuno" },
        { key: "asset_info", value: "factory/juno/token" },
      ],
    }, context, contracts);

    expect(event).toMatchObject({
      kind: "pool_created",
      pairAddress: "juno1pair",
      liquidityTokenAddress: "factory/juno1pair/astroport/share",
      poolType: "xyk",
      assetInfos: ["ujuno", "factory/juno/token"],
    });
  });

  it("normalizes swap events emitted by pair contracts", () => {
    const event = normalizeWasmEvent({
      type: "wasm",
      attributes: [
        { key: "_contract_address", value: "juno1pair" },
        { key: "action", value: "swap" },
        { key: "sender", value: "juno1trader" },
        { key: "offer_asset", value: "ujuno" },
        { key: "offer_amount", value: "1000" },
        { key: "ask_asset", value: "factory/juno/token" },
        { key: "return_amount", value: "990" },
        { key: "commission_amount", value: "3" },
      ],
    }, context, contracts);

    expect(event).toMatchObject({
      kind: "swap",
      pairAddress: "juno1pair",
      trader: "juno1trader",
      offerAsset: "ujuno",
      offerAmount: "1000",
      returnAmount: "990",
      commissionAmount: "3",
    });
  });

  it("normalizes provide and withdraw liquidity events", () => {
    const events = normalizeBlockEvents([
      {
        type: "wasm",
        attributes: [
          { key: "_contract_address", value: "juno1pair" },
          { key: "action", value: "provide_liquidity" },
          { key: "sender", value: "juno1lp" },
          { key: "asset", value: "ujuno" },
          { key: "asset", value: "factory/juno/token" },
          { key: "amount", value: "1000" },
          { key: "amount", value: "2000" },
          { key: "share", value: "1414" },
        ],
      },
      {
        type: "wasm",
        attributes: [
          { key: "_contract_address", value: "juno1pair" },
          { key: "action", value: "withdraw_liquidity" },
          { key: "sender", value: "juno1lp" },
          { key: "share", value: "100" },
        ],
      },
    ], { chainId: "juno-1", height: 124, blockTime: "2026-07-02T00:01:00Z", txHash: "DEF" }, contracts);

    expect(events.map((event) => event.kind)).toEqual(["provide", "withdraw"]);
    expect(events[0]).toMatchObject({ provider: "juno1lp", assets: [{ asset: "ujuno", amount: "1000" }, { asset: "factory/juno/token", amount: "2000" }] });
  });

  it("normalizes incentives events from the configured incentives contract", () => {
    const event = normalizeWasmEvent({
      type: "wasm",
      attributes: [
        { key: "_contract_address", value: "juno1incentives" },
        { key: "action", value: "deposit" },
        { key: "sender", value: "juno1staker" },
        { key: "lp_token", value: "factory/juno1pair/astroport/share" },
        { key: "amount", value: "500" },
      ],
    }, context, contracts);

    expect(event).toMatchObject({
      kind: "incentive",
      action: "deposit",
      userAddress: "juno1staker",
      lpTokenAddress: "factory/juno1pair/astroport/share",
      amount: "500",
    });
  });
});
