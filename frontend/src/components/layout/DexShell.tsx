import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import junoLogo from "../../assets/juno-logo-salmon.svg";
import junoWordmark from "../../assets/juno-wordmark-salmon.svg";
import { navigationItems } from "../../app/routes";
import { WalletProvider } from "../../wallet/WalletContext";
import { ChainStatusBadge } from "../wallet/ChainStatusBadge";
import { NetworkGuardBanner } from "../wallet/NetworkGuardBanner";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { SettingsPanel } from "../settings/SettingsPanel";
import { SlippageSettingsProvider } from "../../settings/SlippageSettingsContext";
import { dexRegistry } from "../../config/registry";

export function DexShell({ children }: { children: ReactNode }) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <WalletProvider>
      <SlippageSettingsProvider>
      <div className="dex-shell">
        <header className="app-header">
          <div className="header-inner">
            <NavLink className="brand-lockup" to="/swap" aria-label="Juno DEX home">
              <img className="brand-logo" src={junoLogo} alt="" aria-hidden="true" />
              <span className="brand-copy">
                <span className="eyebrow">Juno mainnet · Δ.4.0.0</span>
                <h1 className="brand-title">
                  <img src={junoWordmark} alt="Juno" />
                  <span>DEX</span>
                </h1>
              </span>
            </NavLink>

            <div className="topbar-actions">
              <ChainStatusBadge rpcEndpoint={dexRegistry.rpcEndpoint} />
              <WalletConnectButton />
              <button
                className="icon-button"
                type="button"
                aria-label="Open settings"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                ∴
              </button>
              <button
                className="mobile-nav-toggle"
                type="button"
                aria-controls="primary-navigation"
                aria-expanded={isNavOpen}
                onClick={() => setIsNavOpen((open) => !open)}
              >
                Menu
              </button>
            </div>
          </div>

          <nav id="primary-navigation" className={`primary-nav ${isNavOpen ? "is-open" : ""}`} aria-label="Primary navigation">
            {navigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                onClick={() => setIsNavOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
        </header>

        <NetworkGuardBanner />

        <main className="app-main" tabIndex={-1}>{children}</main>
      </div>
      </SlippageSettingsProvider>
    </WalletProvider>
  );
}
