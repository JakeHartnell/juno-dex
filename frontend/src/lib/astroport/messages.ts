import type { RegistryAsset } from "../../config/registry";
import type { Asset, ExecuteMsg as PairExecuteMsg } from "../generated/Pair.types";
import { nativeFunds, sortNativeFunds, toAsset } from "./assetInfo";
import { toBase64, toUtf8 } from "@cosmjs/encoding";

export function createSwapMessage(offerAsset: RegistryAsset, askAsset: RegistryAsset, amount: string, maxSpread: string) {
  const msg = {
    swap: {
      offer_asset: toAsset(offerAsset, amount),
      ask_asset_info: askAsset.kind === "cw20"
        ? { token: { contract_addr: askAsset.id } }
        : { native_token: { denom: askAsset.id } },
      max_spread: maxSpread,
    },
  } satisfies PairExecuteMsg;

  return {
    msg,
    funds: nativeFunds(offerAsset, amount),
  };
}

export function createCw20SwapSendMessage(pairContract: string, askAsset: RegistryAsset, amount: string, maxSpread: string) {
  const hook = {
    swap: {
      ask_asset_info: askAsset.kind === "cw20" ? { token: { contract_addr: askAsset.id } } : { native_token: { denom: askAsset.id } },
      max_spread: maxSpread,
    },
  };
  return {
    send: {
      contract: pairContract,
      amount,
      msg: toBase64(toUtf8(JSON.stringify(hook))),
    },
  };
}

export function createProvideLiquidityMessage(assets: [RegistryAsset, RegistryAsset], amounts: [string, string], slippageTolerance = "0.01", minLpToReceive?: string) {
  if (assets.some((asset) => asset.kind === "cw20")) throw new Error("CW20 add liquidity is unavailable until exact allowances are implemented");
  const msg = {
    provide_liquidity: {
      assets: [toAsset(assets[0], amounts[0]), toAsset(assets[1], amounts[1])],
      slippage_tolerance: slippageTolerance,
      min_lp_to_receive: minLpToReceive,
    },
  } satisfies PairExecuteMsg;

  return {
    msg,
    funds: sortNativeFunds([...nativeFunds(assets[0], amounts[0]), ...nativeFunds(assets[1], amounts[1])]),
  };
}

export function createWithdrawLiquidityMessage(minAssetsToReceive?: Asset[]) {
  return {
    withdraw_liquidity: {
      min_assets_to_receive: minAssetsToReceive && minAssetsToReceive.length > 0 ? minAssetsToReceive : undefined,
    },
  } satisfies PairExecuteMsg;
}
