import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attributesToRecord, normalizeBlockEvents, normalizeWasmEvent } from "../src/events.js";

const context = { chainId: "juno-1", height: 123, blockTime: "2026-07-02T00:00:00Z", txHash: "ABC", msgIndex: 0, eventIndex: 0 };
const contracts = { factoryAddress: "juno1factory", incentivesAddress: "juno1incentives" };
const factoryAddress = "juno1n5ettlqdt06nd346mnqy65fahcvmncaazpwn8s3m0df3ldv0d2yqjqelca";
const incentivesAddress = "juno1h0auy2knfyhkcn877cqun0fu00safgsjwvt82d4cvd0slv8q7wtsk59598";
const pairAddress = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";
const testDenom = "factory/juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76/junoagenttest202607010323";
const junoV1Contracts = { factoryAddress, incentivesAddress };

type Fixture = { height: number; txhash: string; timestamp: string; events: Array<{ type: string; attributes: Array<{ key: string; value: string; index?: boolean }> }> };

function fixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "juno-v1", `${name}.json`), "utf8")) as Fixture;
}

function normalizedFixture(name: string) {
  const tx = fixture(name);
  return normalizeBlockEvents(tx.events, { chainId: "juno-1", height: tx.height, blockTime: tx.timestamp, txHash: tx.txhash }, junoV1Contracts);
}

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

  it("normalizes the real Juno v1 create-pair deployment tx fixture", () => {
    const events = normalizedFixture("create-pair");
    const created = events.find((event) => event.kind === "pool_created");
    expect(created).toMatchObject({
      kind: "pool_created",
      height: 39381305,
      txHash: "8EFD15276286C15D5CFF11B55D49522D2987E16F8220DE671CA0971E586BCD8E",
      factoryAddress,
      pairAddress,
    });
  });

  it("normalizes real Juno v1 liquidity tx fixtures with asset amounts", () => {
    const seed = normalizedFixture("seed-liquidity");
    expect(seed).toHaveLength(1);
    expect(seed[0]).toMatchObject({
      kind: "provide",
      pairAddress,
      shareAmount: "9999000",
      assets: [{ amount: "10000000", asset: "ujuno" }, { amount: "10000000", asset: testDenom }],
    });

    const add = normalizedFixture("smoke-add-liquidity");
    expect(add[0]).toMatchObject({ kind: "provide", shareAmount: "9900", assets: [{ amount: "10000", asset: "ujuno" }, { amount: "9803", asset: testDenom }] });

    const withdraw = normalizedFixture("smoke-withdraw-liquidity");
    expect(withdraw[0]).toMatchObject({ kind: "withdraw", shareAmount: "1000", assets: [{ amount: "1010", asset: "ujuno" }, { amount: "990", asset: testDenom }] });
  });

  it("normalizes the real Juno v1 smoke swap tx fixture", () => {
    const events = normalizedFixture("smoke-swap");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "swap",
      pairAddress,
      trader: "juno1xsx746x4375g39f9fj07hr7qm0wuf0ksl0an76",
      offerAsset: "ujuno",
      askAsset: testDenom,
      offerAmount: "100000",
      returnAmount: "98712",
      spreadAmount: "991",
      commissionAmount: "297",
    });
  });
});
