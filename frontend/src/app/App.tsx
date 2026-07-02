import { DexShell } from "../components/layout/DexShell";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <DexShell>
      <AppRoutes />
    </DexShell>
  );
}
