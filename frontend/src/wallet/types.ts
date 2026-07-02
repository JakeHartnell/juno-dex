import type { Coin } from "@cosmjs/stargate";

export type CosmWasmExecuteClient = {
  execute: (
    senderAddress: string,
    contractAddress: string,
    msg: Record<string, unknown>,
    fee: "auto" | number,
    memo?: string,
    funds?: Coin[],
  ) => Promise<unknown>;
};

export type WalletState = {
  status: "idle" | "connecting" | "connected" | "error";
  address?: string;
  name?: string;
  error?: string;
  chainId?: string;
  signer?: unknown;
  getSigningCosmWasmClient?: () => Promise<CosmWasmExecuteClient>;
};

export type NetworkGuardState = {
  expectedChainId: "juno-1";
  connectedChainId?: string;
  isWalletConnected: boolean;
  isRecovering: boolean;
  isWrongNetwork: boolean;
  isJunoReady: boolean;
  message?: string;
};
