import type { RegistryAsset } from "../../config/registry";
import type { ExecuteMsg as PairExecuteMsg } from "../generated/Pair.types";
import { nativeFunds, toAsset } from "./assetInfo";

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

export function createProvideLiquidityMessage(assets: [RegistryAsset, RegistryAsset], amounts: [string, string], slippageTolerance = "0.01") {
  const msg = {
    provide_liquidity: {
      assets: [toAsset(assets[0], amounts[0]), toAsset(assets[1], amounts[1])],
      slippage_tolerance: slippageTolerance,
    },
  } satisfies PairExecuteMsg;

  return {
    msg,
    funds: [...nativeFunds(assets[0], amounts[0]), ...nativeFunds(assets[1], amounts[1])],
  };
}

export function createWithdrawLiquidityMessage() {
  return { withdraw_liquidity: {} } satisfies PairExecuteMsg;
}
