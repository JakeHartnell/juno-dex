import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { JUNO_CHAIN_INFO } from "../config/chains";

type JunoChainInfo = typeof JUNO_CHAIN_INFO;

declare global {
  interface Window {
    keplr?: {
      enable(chainId: string): Promise<void>;
      experimentalSuggestChain?(chainInfo: JunoChainInfo): Promise<void>;
      getKey(chainId: string): Promise<{ bech32Address: string; name: string }>;
      getOfflineSignerAuto?(chainId: string): Promise<OfflineSigner>;
      getOfflineSigner(chainId: string): OfflineSigner;
    };
  }
}

export type WalletState = {
  status: "idle" | "connecting" | "connected" | "error";
  address?: string;
  name?: string;
  error?: string;
  signer?: OfflineSigner;
};
