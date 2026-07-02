import { JUNO_CHAIN_INFO } from "./chains";

export const COSMOS_KIT_CHAIN_NAME = "juno";

export const junoChain = {
  chain_name: COSMOS_KIT_CHAIN_NAME,
  chain_type: "cosmos",
  chain_id: JUNO_CHAIN_INFO.chainId,
  pretty_name: JUNO_CHAIN_INFO.chainName,
  status: "live",
  network_type: "mainnet",
  bech32_prefix: JUNO_CHAIN_INFO.bech32Config.bech32PrefixAccAddr,
  bech32_config: JUNO_CHAIN_INFO.bech32Config,
  slip44: JUNO_CHAIN_INFO.bip44.coinType,
  fees: {
    fee_tokens: JUNO_CHAIN_INFO.feeCurrencies.map((currency) => ({
      denom: currency.coinMinimalDenom,
      low_gas_price: currency.gasPriceStep.low,
      average_gas_price: currency.gasPriceStep.average,
      high_gas_price: currency.gasPriceStep.high,
    })),
  },
  staking: {
    staking_tokens: [{ denom: JUNO_CHAIN_INFO.stakeCurrency.coinMinimalDenom }],
  },
  codebase: {
    cosmwasm_enabled: JUNO_CHAIN_INFO.features.includes("cosmwasm"),
  },
  apis: {
    rpc: [{ address: JUNO_CHAIN_INFO.rpc, provider: "itastakers" }],
    rest: [{ address: JUNO_CHAIN_INFO.rest, provider: "itastakers" }],
  },
} as const;

export const junoAssetList = {
  chain_name: COSMOS_KIT_CHAIN_NAME,
  assets: JUNO_CHAIN_INFO.currencies.map((currency) => ({
    base: currency.coinMinimalDenom,
    name: currency.coinDenom,
    display: currency.coinDenom.toLowerCase(),
    symbol: currency.coinDenom,
    coingecko_id: currency.coinGeckoId,
    type_asset: "sdk.coin",
    denom_units: [
      { denom: currency.coinMinimalDenom, exponent: 0 },
      { denom: currency.coinDenom.toLowerCase(), exponent: currency.coinDecimals },
    ],
  })),
} as const;
