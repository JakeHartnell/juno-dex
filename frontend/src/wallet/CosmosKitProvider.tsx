import { ChainProvider } from "@cosmos-kit/react";
import { wallets as keplrWallets } from "@cosmos-kit/keplr";
import { GasPrice } from "@cosmjs/stargate";
import type { ReactNode } from "react";
import { JUNO_CHAIN_INFO } from "../config/chains";
import { junoAssetList, junoChain } from "../config/cosmosKit";
import { dexRegistry } from "../config/registry";
import { interchainJunoTheme } from "../theme/junoTheme";

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;
type ChainProviderProps = Parameters<typeof ChainProvider>[0];

const walletconnectOptions: ChainProviderProps["walletConnectOptions"] = walletConnectProjectId
  ? { signClient: { projectId: walletConnectProjectId } }
  : undefined;

const allWallets = [
  ...keplrWallets,
];

const wallets = walletconnectOptions
  ? allWallets
  : allWallets.filter((wallet) => wallet.walletInfo.mode !== "wallet-connect");

export function CosmosKitProvider({ children }: { children: ReactNode }) {
  return (
    <ChainProvider
      chains={[junoChain] as never}
      assetLists={[junoAssetList] as never}
      wallets={wallets}
      modalTheme={{
        defaultTheme: "dark",
        customTheme: interchainJunoTheme.name,
        themeDefs: [interchainJunoTheme],
        modalContainerClassName: "juno-wallet-modal",
        modalContentClassName: "juno-wallet-modal-content",
        modalChildrenClassName: "juno-wallet-modal-children",
        modalContentStyles: { background: "#230A0C", border: "1px solid rgba(255, 123, 124, 0.35)", borderRadius: "5px" },
      }}
      walletConnectOptions={walletconnectOptions}
      throwErrors={false}
      endpointOptions={{
        endpoints: {
          juno: {
            rpc: [dexRegistry.rpcEndpoint, ...JUNO_CHAIN_INFO.fallbackRpcs],
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
