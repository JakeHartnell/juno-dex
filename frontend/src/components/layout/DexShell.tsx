import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import junoLogo from "../../assets/juno-logo-salmon.svg";
import junoWordmark from "../../assets/juno-wordmark-salmon.svg";
import { navigationItems, walletNavigationItems } from "../../app/routes";
import { WalletProvider } from "../../wallet/WalletContext";
import { NetworkGuardBanner } from "../wallet/NetworkGuardBanner";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { SlippageSettingsProvider } from "../../settings/SlippageSettingsContext";
import { navIconByRoute } from "./NavIcons";
import { useWallet } from "../../wallet/WalletContext";

export function DexShell({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <SlippageSettingsProvider>
        <DexShellContent>{children}</DexShellContent>
      </SlippageSettingsProvider>
    </WalletProvider>
  );
}

function DexShellContent({ children }: { children: ReactNode }) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const { wallet } = useWallet();
  const location = useLocation();
  useEffect(() => setIsNavOpen(false), [location.pathname]);
  const currentRoute = navigationItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
  const pageTitle = currentRoute?.label ?? "Swap";
  const coordByPrefix: Array<[string, string]> = [
    ["/swap", "Exchange · Swap"],
    ["/pools", "Liquidity · Pools"],
    ["/stats", "Data · Stats"],
    ["/portfolio", "Portfolio"],
    ["/create", "Liquidity · Create"],
    ["/liquidity", "Liquidity · Positions"],
  ];
  const topbarCoord = coordByPrefix.find(([prefix]) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`))?.[1] ?? pageTitle;

  const visibleNavigationItems = wallet.status === "connected" ? [...navigationItems, ...walletNavigationItems] : navigationItems;

  return (
      <div className="dex-shell">
        <header className="app-header">
          <div className="header-inner">
            <NavLink className="brand-lockup" to="/swap" aria-label="Juno DEX home">
              <img className="brand-logo" src={junoLogo} alt="" aria-hidden="true" />
              <span className="brand-copy">
                <h1 className="brand-title">
                  <img src={junoWordmark} alt="Juno" />
                  <span>DEX</span>
                </h1>
              </span>
            </NavLink>
            <button
              className="mobile-nav-toggle"
              type="button"
              aria-controls="primary-navigation"
              aria-expanded={isNavOpen}
              onClick={() => setIsNavOpen((open) => !open)}
            >
              <span aria-hidden="true" className="mobile-nav-icon" />
              <span className="sr-only">{isNavOpen ? "Close navigation" : "Open navigation"}</span>
            </button>
          </div>

          <nav id="primary-navigation" className={`primary-nav ${isNavOpen ? "is-open" : ""}`} aria-label="Primary navigation">
            {visibleNavigationItems.map((item) => {
              const NavIcon = navIconByRoute[item.to];
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                  onClick={() => setIsNavOpen(false)}
                >
                  {NavIcon ? <NavIcon className="nav-link-icon" size={17} /> : null}
                  <span className="nav-link-label">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="sidebar-network">
            <span className="eyebrow">Network</span>
            <div><span>Chain</span><strong>juno-1</strong></div>
            <div><span>Status</span><strong className="net-live"><span className="net-dot" aria-hidden="true" />Live</strong></div>
            <div><span>Phase</span><strong>Δ.4.0.0</strong></div>
          </div>
        </header>

        <div className="app-topbar">
          <span className="eyebrow topbar-coord">{topbarCoord}</span>
          <div className="topbar-actions">
            <WalletConnectButton />
          </div>
        </div>

        <NetworkGuardBanner />

        <main className="app-main" tabIndex={-1}>{children}</main>
      </div>
  );
}
