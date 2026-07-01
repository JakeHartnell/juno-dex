import { JUNO_CHAIN_INFO } from "../config/chains";
import type { WalletState } from "./types";

export async function connectKeplr(): Promise<WalletState> {
  if (!window.keplr) {
    return { status: "error", error: "Keplr extension not found. Read-only mode remains available." };
  }

  try {
    if (window.keplr.experimentalSuggestChain) {
      await window.keplr.experimentalSuggestChain(JUNO_CHAIN_INFO);
    }
    await window.keplr.enable(JUNO_CHAIN_INFO.chainId);
    const key = await window.keplr.getKey(JUNO_CHAIN_INFO.chainId);
    const signer = window.keplr.getOfflineSignerAuto
      ? await window.keplr.getOfflineSignerAuto(JUNO_CHAIN_INFO.chainId)
      : window.keplr.getOfflineSigner(JUNO_CHAIN_INFO.chainId);
    return { status: "connected", address: key.bech32Address, name: key.name, signer };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "Keplr connection failed" };
  }
}
