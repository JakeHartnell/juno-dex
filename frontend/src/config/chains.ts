export const JUNO_CHAIN_INFO = {
  chainId: "juno-1",
  chainName: "Juno",
  rpc: "https://rpc-juno.itastakers.com",
  rest: "https://lcd-juno.itastakers.com",
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: "juno",
    bech32PrefixAccPub: "junopub",
    bech32PrefixValAddr: "junovaloper",
    bech32PrefixValPub: "junovaloperpub",
    bech32PrefixConsAddr: "junovalcons",
    bech32PrefixConsPub: "junovalconspub",
  },
  currencies: [
    {
      coinDenom: "JUNO",
      coinMinimalDenom: "ujuno",
      coinDecimals: 6,
      coinGeckoId: "juno-network",
    },
  ],
  feeCurrencies: [
    {
      coinDenom: "JUNO",
      coinMinimalDenom: "ujuno",
      coinDecimals: 6,
      coinGeckoId: "juno-network",
      gasPriceStep: { low: 0.075, average: 0.075, high: 0.1 },
    },
  ],
  stakeCurrency: {
    coinDenom: "JUNO",
    coinMinimalDenom: "ujuno",
    coinDecimals: 6,
    coinGeckoId: "juno-network",
  },
  features: ["cosmwasm", "ibc-transfer"],
} as const;
