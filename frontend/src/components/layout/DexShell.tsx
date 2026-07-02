import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Box, Stack, Text } from "@interchain-ui/react";
import junoLogo from "../../assets/juno-dex-logo.svg";
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
      <Box className="dex-shell">
        <Box as="header" className="app-header">
          <Stack className="header-inner" direction="horizontal" align="center" justify="space-between">
            <NavLink className="brand-lockup" to="/swap" aria-label="Juno DEX home">
              <img className="brand-logo" src={junoLogo} alt="" aria-hidden="true" />
              <Box className="brand-copy">
                <Text as="p" className="eyebrow">Juno mainnet</Text>
                <Text as="h1" variant="heading" className="brand-title">Juno DEX</Text>
              </Box>
            </NavLink>

            <Stack className="topbar-actions" direction="horizontal" align="center" justify="flex-end">
              <ChainStatusBadge rpcEndpoint={dexRegistry.rpcEndpoint} />
              <WalletConnectButton />
              <button
                className="icon-button"
                type="button"
                aria-label="Open settings"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                ⚙
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
            </Stack>
          </Stack>

          <Box id="primary-navigation" as="nav" className={`primary-nav ${isNavOpen ? "is-open" : ""}`} aria-label="Primary navigation">
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
          </Box>

          {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
        </Box>

        <NetworkGuardBanner />

        <Box as="main" className="app-main" tabIndex={-1}>{children}</Box>

        <Box as="footer" className="app-footer" />
      </Box>
      </SlippageSettingsProvider>
    </WalletProvider>
  );
}
