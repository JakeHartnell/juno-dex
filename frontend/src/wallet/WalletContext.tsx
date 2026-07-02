import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useChain } from "@cosmos-kit/react";
import { COSMOS_KIT_CHAIN_NAME } from "../config/cosmosKit";
import type { WalletState } from "./types";

type WalletContextValue = {
  wallet: WalletState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  openView: () => void;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const cosmosWallet = useCosmosKitWallet();
  return <WalletContext.Provider value={cosmosWallet}>{children}</WalletContext.Provider>;
}

export function useCosmosKitWallet(): WalletContextValue {
  const chain = useChain(COSMOS_KIT_CHAIN_NAME);

  const wallet = useMemo<WalletState>(() => {
    if (chain.isWalletConnected && chain.address) {
      return {
        status: "connected",
        address: chain.address,
        name: chain.username ?? chain.wallet?.prettyName,
        signer: chain.getOfflineSigner(),
        getSigningCosmWasmClient: chain.getSigningCosmWasmClient,
      };
    }

    if (chain.isWalletConnecting) return { status: "connecting" };

    if (chain.isWalletRejected || chain.isWalletNotExist || chain.isWalletError) {
      return {
        status: "error",
        error: chain.message ?? "Wallet connection failed. Read-only mode remains available.",
      };
    }

    return { status: "idle" };
  }, [chain]);

  const value = useMemo(
    () => ({
      wallet,
      connect: async () => chain.openView(),
      disconnect: async () => chain.disconnect(),
      openView: chain.openView,
    }),
    [chain, wallet],
  );

  return value;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}
