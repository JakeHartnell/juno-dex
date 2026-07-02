import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_SLIPPAGE_BPS,
  SLIPPAGE_STORAGE_KEY,
  clampSlippageBps,
  formatSlippagePercent,
  slippageBpsToMaxSpread,
  slippageBpsToPercent,
  slippagePercentToBps,
} from "../lib/swap/slippage";

type SlippageSettings = {
  slippageBps: number;
  slippagePercent: number;
  maxSpread: string;
  setSlippageBps: (bps: number) => void;
  setSlippagePercent: (percent: number) => void;
  formattedSlippagePercent: string;
};

const SlippageSettingsContext = createContext<SlippageSettings | undefined>(undefined);

function readStoredSlippageBps(): number {
  if (typeof window === "undefined") return DEFAULT_SLIPPAGE_BPS;
  const stored = window.localStorage.getItem(SLIPPAGE_STORAGE_KEY);
  if (!stored) return DEFAULT_SLIPPAGE_BPS;
  return clampSlippageBps(Number(stored));
}

export function SlippageSettingsProvider({ children }: { children: ReactNode }) {
  const [slippageBps, setSlippageBpsState] = useState(readStoredSlippageBps);

  const setSlippageBps = (nextBps: number) => {
    const safeBps = clampSlippageBps(nextBps);
    setSlippageBpsState(safeBps);
    if (typeof window !== "undefined") window.localStorage.setItem(SLIPPAGE_STORAGE_KEY, String(safeBps));
  };

  const value = useMemo<SlippageSettings>(() => ({
    slippageBps,
    slippagePercent: slippageBpsToPercent(slippageBps),
    maxSpread: slippageBpsToMaxSpread(slippageBps),
    setSlippageBps,
    setSlippagePercent: (percent: number) => setSlippageBps(slippagePercentToBps(percent)),
    formattedSlippagePercent: formatSlippagePercent(slippageBps),
  }), [slippageBps]);

  return <SlippageSettingsContext.Provider value={value}>{children}</SlippageSettingsContext.Provider>;
}

export function useSlippageSettings() {
  const context = useContext(SlippageSettingsContext);
  if (!context) throw new Error("useSlippageSettings must be used within SlippageSettingsProvider");
  return context;
}
