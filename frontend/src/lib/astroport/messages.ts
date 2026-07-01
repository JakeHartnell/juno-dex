import type { RegistryAsset } from "../../config/registry";
import { nativeFunds, toAsset } from "./assetInfo";

export function createSwapMessage(offerAsset: RegistryAsset, askAsset: RegistryAsset, amount: string, maxSpread = "0.01") {
  return {
    msg: {
      swap: {
        offer_asset: toAsset(offerAsset, amount),
        ask_asset_info: askAsset.kind === "cw20"
          ? { token: { contract_addr: askAsset.id } }
          : { native_token: { denom: askAsset.id } },
        max_spread: maxSpread,
      },
    },
    funds: nativeFunds(offerAsset, amount),
  };
}

export function createProvideLiquidityMessage(assets: [RegistryAsset, RegistryAsset], amounts: [string, string], slippageTolerance = "0.01") {
  return {
    msg: {
      provide_liquidity: {
        assets: [toAsset(assets[0], amounts[0]), toAsset(assets[1], amounts[1])],
        slippage_tolerance: slippageTolerance,
      },
    },
    funds: [...nativeFunds(assets[0], amounts[0]), ...nativeFunds(assets[1], amounts[1])],
  };
}

export function createWithdrawLiquidityMessage() {
  return { withdraw_liquidity: {} };
}
