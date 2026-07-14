import { DexShell } from "../components/layout/DexShell";
import { AppRoutes } from "./routes";
import { TxHistoryProvider } from "../tx/TxHistoryContext";
import { TransactionCenter } from "../components/tx/TransactionCenter";

export function App() {
  return (
    <TxHistoryProvider>
      <DexShell>
        <AppRoutes />
        <TransactionCenter />
      </DexShell>
    </TxHistoryProvider>
  );
}
