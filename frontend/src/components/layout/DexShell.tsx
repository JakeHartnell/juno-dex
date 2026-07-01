import type { ReactNode } from "react";
import { dexRegistry } from "../../config/registry";
import { ChainStatusBadge } from "../wallet/ChainStatusBadge";
import { WalletConnectButton } from "../wallet/WalletConnectButton";

export function DexShell({ children, navigation }: { children: ReactNode; navigation: ReactNode }) {
  return (
    <div className="dex-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Astroport Core · Juno mainnet</p>
          <h1>Juno DEX</h1>
        </div>
        <div className="topbar-actions">
          <ChainStatusBadge rpcEndpoint={dexRegistry.rpcEndpoint} />
          <WalletConnectButton />
        </div>
      </header>
      <nav className="nav-tabs">{navigation}</nav>
      <main>{children}</main>
    </div>
  );
}
