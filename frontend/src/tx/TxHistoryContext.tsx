import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TxLifecycleStatus } from "./useTxRunner";

export const TX_HISTORY_STORAGE_KEY = "juno-dex.transaction-history";

export type PersistedTxRecord = {
  id: string;
  title: string;
  status: Exclude<TxLifecycleStatus, "idle">;
  description?: string;
  txHash?: string;
  updatedAt: number;
};

type TxHistoryContextValue = {
  records: PersistedTxRecord[];
  upsert: (record: PersistedTxRecord) => void;
  dismiss: (id: string) => void;
  centerOpen: boolean;
  setCenterOpen: (open: boolean) => void;
};

const TxHistoryContext = createContext<TxHistoryContextValue | undefined>(undefined);

function readStoredRecords(): PersistedTxRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TX_HISTORY_STORAGE_KEY) ?? "[]") as PersistedTxRecord[];
    return Array.isArray(parsed) ? parsed.filter((record) => record && typeof record.id === "string" && typeof record.updatedAt === "number").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function TxHistoryProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<PersistedTxRecord[]>(readStoredRecords);
  const [centerOpen, setCenterOpen] = useState(false);
  const normalizeAndStore = useCallback((next: PersistedTxRecord[]) => {
    const limited = [...next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
    if (typeof window !== "undefined") window.localStorage.setItem(TX_HISTORY_STORAGE_KEY, JSON.stringify(limited));
    return limited;
  }, []);
  const upsert = useCallback((record: PersistedTxRecord) => {
    setRecords((current) => normalizeAndStore([record, ...current.filter((candidate) => candidate.id !== record.id)]));
  }, [normalizeAndStore]);
  const dismiss = useCallback((id: string) => setRecords((current) => normalizeAndStore(current.filter((record) => record.id !== id))), [normalizeAndStore]);
  const value = useMemo(() => ({ records, upsert, dismiss, centerOpen, setCenterOpen }), [centerOpen, dismiss, records, upsert]);
  return <TxHistoryContext.Provider value={value}>{children}</TxHistoryContext.Provider>;
}

const noHistory: TxHistoryContextValue = { records: [], upsert: () => undefined, dismiss: () => undefined, centerOpen: false, setCenterOpen: () => undefined };

export function useTxHistory() {
  return useContext(TxHistoryContext) ?? noHistory;
}
