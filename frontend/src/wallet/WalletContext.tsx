import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { connectKeplr } from "./keplr";
import type { WalletState } from "./types";

type WalletContextValue = {
  wallet: WalletState;
  connect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({ status: "idle" });

  async function connect() {
    setWallet({ status: "connecting" });
    setWallet(await connectKeplr());
  }

  const value = useMemo(() => ({ wallet, connect }), [wallet]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}
