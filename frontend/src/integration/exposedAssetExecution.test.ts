import { fromBase64, fromUtf8 } from "@cosmjs/encoding";
import { describe, expect, it } from "vitest";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { dexRegistry } from "../config/registry";
import { routeToOperations, type SwapRoute } from "../lib/astroport/routes";
import { executeInstructionToEncodeObject } from "../lib/cosmjs/fees";
import { buildCreatePoolExecuteInstruction } from "../mutations/useCreatePoolTx";
import { buildProvideLiquidityExecuteInstruction } from "../mutations/useProvideLiquidityTx";
import { buildSwapExecuteInstruction } from "../mutations/useSwapTx";
import { buildWithdrawLiquidityExecuteInstruction } from "../mutations/useWithdrawLiquidityTx";

const sender = "juno1sender000000000000000000000000000000000";
const native: RegistryAsset = { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6, verified: true };
const ibc: RegistryAsset = { kind: "ibc", id: "ibc/0123456789ABCDEF", symbol: "USDC", decimals: 6, verified: true, denomTrace: "transfer/channel-1/uusdc" };
const tokenFactory: RegistryAsset = { kind: "native", id: "factory/juno1issuer000000000000000000000000000000/asset", symbol: "FACT", decimals: 6, verified: true };
const cw20: RegistryAsset = { kind: "cw20", id: "juno1cw20token000000000000000000000000000000000", symbol: "CW20", decimals: 6, verified: true };
const bridge: RegistryAsset = { kind: "native", id: "uatom", symbol: "ATOM", decimals: 6, verified: true };

function pool(id: string, assets: [RegistryAsset, RegistryAsset]): RegistryPool {
  return {
    id,
    label: assets.map((asset) => asset.symbol).join(" / "),
    pair: `juno1${id}pair000000000000000000000000000000000`,
    lpToken: `factory/juno1${id}pair000000000000000000000000000000000/astroport/share`,
    explorer: `https://explorer.invalid/${id}`,
    type: "xyk",
    feeBps: 30,
    assets,
    enabled: true,
    status: "active",
    verified: true,
    source: "registry",
  };
}

function directRoute(offer: RegistryAsset, ask = bridge): SwapRoute {
  const pair = pool(`direct${offer.symbol.toLowerCase()}`, [offer, ask]);
  const hops = [{ pool: pair, offerAsset: offer, askAsset: ask }];
  return { id: pair.id, hops, operations: routeToOperations(hops) };
}

function routedRoute(offer: RegistryAsset, ask = native): SwapRoute {
  const first = pool(`first${offer.symbol.toLowerCase()}`, [offer, bridge]);
  const second = pool(`second${offer.symbol.toLowerCase()}`, [bridge, ask]);
  const hops = [
    { pool: first, offerAsset: offer, askAsset: bridge },
    { pool: second, offerAsset: bridge, askAsset: ask },
  ];
  return { id: `${first.id}|${second.id}`, hops, operations: routeToOperations(hops) };
}

function encodedJson(instruction: ReturnType<typeof buildSwapExecuteInstruction>) {
  const encoded = executeInstructionToEncodeObject(sender, instruction);
  return JSON.parse(fromUtf8(encoded.value.msg!)) as Record<string, any>;
}

describe("exposed asset execution integration matrix", () => {
  it.each([
    ["native", native],
    ["IBC", ibc],
    ["TokenFactory", tokenFactory],
  ])("encodes a bounded direct %s swap with the exact offered funds", (_label, offer) => {
    const route = directRoute(offer);
    const instruction = buildSwapExecuteInstruction({ route, pool: route.hops[0].pool, offerAsset: offer, askAsset: bridge, amount: "1000000", maxSpread: "0.01", minimumReceive: "900000", source: "pair" });

    expect(instruction.contractAddress).toBe(route.hops[0].pool.pair);
    expect(instruction.funds).toEqual([{ denom: offer.id, amount: "1000000" }]);
    expect(encodedJson(instruction)).toMatchObject({ swap: { offer_asset: { amount: "1000000" }, max_spread: "0.01" } });
  });

  it("encodes a direct CW20 swap as one atomic send hook", () => {
    const route = directRoute(cw20);
    const instruction = buildSwapExecuteInstruction({ route, pool: route.hops[0].pool, offerAsset: cw20, askAsset: bridge, amount: "1000000", maxSpread: "0.01", minimumReceive: "900000", source: "pair" });
    const message = encodedJson(instruction) as { send: { contract: string; amount: string; msg: string } };

    expect(instruction.contractAddress).toBe(cw20.id);
    expect(instruction.funds ?? []).toEqual([]);
    expect(message.send).toMatchObject({ contract: route.hops[0].pool.pair, amount: "1000000" });
    expect(JSON.parse(fromUtf8(fromBase64(message.send.msg)))).toMatchObject({ swap: { max_spread: "0.01" } });
  });

  it.each([
    ["native", native],
    ["IBC", ibc],
    ["TokenFactory", tokenFactory],
  ])("encodes a bounded multi-hop %s router swap with exact funds", (_label, offer) => {
    const route = routedRoute(offer);
    const instruction = buildSwapExecuteInstruction({ route, offerAsset: offer, askAsset: native, amount: "1000000", maxSpread: "0.01", minimumReceive: "900000", source: "router" });

    expect(instruction.contractAddress).toBe(dexRegistry.router);
    expect(instruction.funds).toEqual([{ denom: offer.id, amount: "1000000" }]);
    expect(encodedJson(instruction)).toMatchObject({ execute_swap_operations: { minimum_receive: "900000", max_spread: "0.01" } });
    expect((encodedJson(instruction) as any).execute_swap_operations.operations).toHaveLength(2);
  });

  it("encodes a multi-hop CW20 router swap as one bounded atomic send hook", () => {
    const route = routedRoute(cw20);
    const instruction = buildSwapExecuteInstruction({ route, offerAsset: cw20, askAsset: native, amount: "1000000", maxSpread: "0.01", minimumReceive: "900000", source: "router" });
    const message = encodedJson(instruction) as { send: { contract: string; amount: string; msg: string } };
    const hook = JSON.parse(fromUtf8(fromBase64(message.send.msg)));

    expect(instruction.contractAddress).toBe(cw20.id);
    expect(message.send).toMatchObject({ contract: dexRegistry.router, amount: "1000000" });
    expect(hook.execute_swap_operations).toMatchObject({ minimum_receive: "900000", max_spread: "0.01" });
    expect(hook.execute_swap_operations.operations).toHaveLength(2);
  });

  it.each([
    ["native + IBC", native, ibc],
    ["native + TokenFactory", native, tokenFactory],
    ["IBC + TokenFactory", ibc, tokenFactory],
  ])("encodes bounded provide and withdraw paths for %s liquidity", (_label, first, second) => {
    const target = pool(`liquidity${first.symbol.toLowerCase()}${second.symbol.toLowerCase()}`, [first, second]);
    const provide = buildProvideLiquidityExecuteInstruction({ pool: target, amounts: ["1000000", "2000000"], slippageTolerance: "0.01", minLpToReceive: "950000" });
    const withdraw = buildWithdrawLiquidityExecuteInstruction({ pool: target, lpAmount: "500000", minAssetsToReceive: [
      { info: { native_token: { denom: first.id } }, amount: "450000" },
      { info: { native_token: { denom: second.id } }, amount: "900000" },
    ] });

    expect(provide.funds).toHaveLength(2);
    expect((provide.msg as any).provide_liquidity).toMatchObject({ slippage_tolerance: "0.01", min_lp_to_receive: "950000" });
    expect(withdraw.funds).toEqual([{ denom: target.lpToken, amount: "500000" }]);
    expect((withdraw.msg as any).withdraw_liquidity.min_assets_to_receive).toHaveLength(2);
  });

  it("rejects the unexposed CW20 liquidity path at the execution boundary", () => {
    expect(() => buildProvideLiquidityExecuteInstruction({ pool: pool("cw20liquidity", [native, cw20]), amounts: ["1", "1"] })).toThrow(/exact allowances/i);
  });

  it.each([
    ["native", native],
    ["IBC", ibc],
    ["TokenFactory", tokenFactory],
    ["CW20", cw20],
  ])("encodes %s asset identity for permissionless pool creation", (_label, asset) => {
    const instruction = buildCreatePoolExecuteInstruction({ assets: [native, asset === native ? bridge : asset], option: { id: "xyk", label: "XYK", pairType: { xyk: {} } } });
    const infos = (instruction.msg as any).create_pair.asset_infos;
    expect(instruction.contractAddress).toBe(dexRegistry.factory);
    expect(infos).toHaveLength(2);
    expect(JSON.stringify(infos)).toContain(asset === native ? bridge.id : asset.id);
  });
});
