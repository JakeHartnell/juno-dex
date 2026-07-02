import { ChainProvider } from "@cosmos-kit/react";
import { wallets as keplrWallets } from "@cosmos-kit/keplr";
import { wallets as leapWallets } from "@cosmos-kit/leap";
import { GasPrice } from "@cosmjs/stargate";
import type { ReactNode } from "react";
import { junoAssetList, junoChain } from "../config/cosmosKit";
import { dexRegistry } from "../config/registry";

const wallets = [
  ...keplrWallets,
  ...leapWallets,
];

export function CosmosKitProvider({ children }: { children: ReactNode }) {
  return (
    <ChainProvider
      chains={[junoChain] as never}
      assetLists={[junoAssetList] as never}
      wallets={wallets}
      throwErrors={false}
      endpointOptions={{
        endpoints: {
          juno: {
            rpc: [dexRegistry.rpcEndpoint],
            rest: [junoChain.apis.rest[0].address],
          },
        },
      }}
      signerOptions={{
        signingCosmwasm: () => ({
          gasPrice: GasPrice.fromString("0.075ujuno"),
        }),
      } as never}
    >
      {children}
    </ChainProvider>
  );
}
