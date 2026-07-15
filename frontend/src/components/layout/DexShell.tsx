import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import junoLogo from "../../assets/juno-logo-salmon.svg";
import junoWordmark from "../../assets/juno-wordmark-salmon.svg";
import { navigationItems, walletNavigationItems } from "../../app/routes";
import { WalletProvider } from "../../wallet/WalletContext";
import { NetworkGuardBanner } from "../wallet/NetworkGuardBanner";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { ChainStatusBadge } from "../wallet/ChainStatusBadge";
import { IndexerStatusBadge } from "../wallet/IndexerStatusBadge";
import { junoDeployment } from "../../config/deployment";
import { SlippageSettingsProvider } from "../../settings/SlippageSettingsContext";
import { navIconByRoute } from "./NavIcons";
import { useWallet } from "../../wallet/WalletContext";
import { useTxHistory } from "../../tx/TxHistoryContext";

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
  const isMobileLayout = useMediaQuery("(max-width: 860px)");
  const { wallet, network } = useWallet();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => setIsNavOpen(false), [location.pathname]);
  const currentRoute = navigationItems.find((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
  const pageTitle = currentRoute?.label ?? "Swap";
  const coordByPrefix: Array<[string, string]> = [
    ["/swap", "Swap"],
    ["/pools", "Pools"],
    ["/portfolio", "Portfolio"],
    ["/create", "Create pool"],
  ];
  const topbarCoord = coordByPrefix.find(([prefix]) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`))?.[1] ?? pageTitle;
  useEffect(() => {
    document.title = `${topbarCoord} | JUNO DEX`;
    mainRef.current?.focus();
  }, [location.pathname, topbarCoord]);

  const visibleNavigationItems = wallet.status === "connected" ? [...navigationItems, ...walletNavigationItems] : navigationItems;

  return (
      <div className="dex-shell">
        <a className="skip-link" href="#main-content" onClick={() => mainRef.current?.focus()}>Skip to main content</a>
        <p className="sr-only" aria-live="polite" aria-atomic="true">{topbarCoord} page loaded</p>
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
            {isMobileLayout ? <div className="mobile-header-account"><WalletConnectButton /></div> : null}
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
            <ChainStatusBadge rpcEndpoint={junoDeployment.rpcEndpoint} />
            <IndexerStatusBadge />
          </div>
        </header>

        <div className="app-topbar">
          <span className="eyebrow topbar-coord">{topbarCoord}</span>
          <div className="topbar-actions">
            {!isMobileLayout ? <WalletConnectButton /> : null}
          </div>
        </div>

        <NetworkGuardBanner />

        <main id="main-content" ref={mainRef} className="app-main" tabIndex={-1}>{children}</main>
        {isMobileLayout ? <MobileQuickNav walletConnected={wallet.status === "connected"} /> : null}
      </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function MobileQuickNav({ walletConnected }: { walletConnected: boolean }) {
  const { records, setCenterOpen } = useTxHistory();
  return (
    <nav className="mobile-quick-nav" aria-label="Mobile quick navigation">
      <NavLink to="/swap" className={({ isActive }) => isActive ? "active" : ""}>Swap</NavLink>
      <NavLink to="/pools" className={({ isActive }) => isActive ? "active" : ""}>Pools</NavLink>
      {walletConnected ? <NavLink to="/portfolio" className={({ isActive }) => isActive ? "active" : ""}>Portfolio</NavLink> : null}
      <button type="button" disabled={records.length === 0} aria-controls="recent-transactions" onClick={() => setCenterOpen(true)}>Activity{records.length > 0 ? ` ${records.length}` : ""}</button>
    </nav>
  );
}
