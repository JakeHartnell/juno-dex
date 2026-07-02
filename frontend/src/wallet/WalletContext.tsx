import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useChain } from "@cosmos-kit/react";
import { JUNO_CHAIN_INFO } from "../config/chains";
import { COSMOS_KIT_CHAIN_NAME } from "../config/cosmosKit";
import { createE2ESigningClient, E2E_WALLET_ADDRESS, isE2EMode } from "../e2e/mocks";
import type { NetworkGuardState, WalletState } from "./types";

type WalletContextValue = {
  wallet: WalletState;
  network: NetworkGuardState;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  openView: () => void;
  switchToJuno: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  if (isE2EMode()) {
    return <WalletContext.Provider value={createE2EWalletContext()}>{children}</WalletContext.Provider>;
  }
  const cosmosWallet = useCosmosKitWallet();
  return <WalletContext.Provider value={cosmosWallet}>{children}</WalletContext.Provider>;
}

function createE2EWalletContext(): WalletContextValue {
  const wallet: WalletState = {
    status: "connected",
    address: E2E_WALLET_ADDRESS,
    name: "Playwright Wallet",
    chainId: JUNO_CHAIN_INFO.chainId,
    getSigningCosmWasmClient: async () => createE2ESigningClient() as never,
  };
  return {
    wallet,
    network: {
      expectedChainId: JUNO_CHAIN_INFO.chainId,
      connectedChainId: JUNO_CHAIN_INFO.chainId,
      isWalletConnected: true,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
    },
    connect: async () => undefined,
    disconnect: async () => undefined,
    openView: () => undefined,
    switchToJuno: async () => undefined,
  };
}

export function useCosmosKitWallet(): WalletContextValue {
  const chain = useChain(COSMOS_KIT_CHAIN_NAME);
  const expectedChainId = JUNO_CHAIN_INFO.chainId;
  const connectedChainId = chain.chain?.chain_id;

  const wallet = useMemo<WalletState>(() => {
    if (chain.isWalletConnected && chain.address) {
      return {
        status: "connected",
        address: chain.address,
        name: chain.username ?? chain.wallet?.prettyName,
        chainId: connectedChainId,
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
  }, [chain, connectedChainId]);

  const network = useMemo<NetworkGuardState>(() => {
    const isWalletConnected = wallet.status === "connected";
    const isWrongNetwork = isWalletConnected && connectedChainId !== expectedChainId;
    const needsEnable = wallet.status === "error" && /enable|chain|not exist|not found|reject/i.test(wallet.error ?? chain.message ?? "");

    return {
      expectedChainId,
      connectedChainId,
      isWalletConnected,
      isRecovering: chain.isWalletConnecting,
      isWrongNetwork,
      isJunoReady: !isWalletConnected || (!isWrongNetwork && wallet.status === "connected"),
      message: isWrongNetwork
        ? `Wallet is connected to ${connectedChainId ?? "an unknown chain"}. Switch to Juno (${expectedChainId}) before broadcasting transactions.`
        : needsEnable
          ? `Juno (${expectedChainId}) is not enabled in this wallet yet. Switch to Juno to continue.`
          : undefined,
    };
  }, [chain.isWalletConnecting, chain.message, connectedChainId, expectedChainId, wallet]);

  const switchToJuno = async () => {
    await chain.enable();
    if (!chain.isWalletConnected) await chain.connect();
  };

  const value = useMemo(
    () => ({
      wallet,
      network,
      connect: async () => chain.openView(),
      disconnect: async () => chain.disconnect(),
      openView: chain.openView,
      switchToJuno,
    }),
    [chain, network, wallet],
  );

  return value;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}

export function useNetworkGuard() {
  const { network, switchToJuno } = useWallet();
  return { network, switchToJuno };
}
