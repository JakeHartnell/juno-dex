import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Box, Stack, Text } from "@interchain-ui/react";
import junoLogo from "../../assets/juno-dex-logo.svg";
import { dexRegistry } from "../../config/registry";
import { navigationItems } from "../../app/routes";
import { WalletProvider } from "../../wallet/WalletContext";
import { RiskNotice } from "../common/RiskNotice";
import { ChainStatusBadge } from "../wallet/ChainStatusBadge";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { SettingsPanel } from "../settings/SettingsPanel";
import { SlippageSettingsProvider } from "../../settings/SlippageSettingsContext";

type ContractLink = {
  label: string;
  address: string | undefined;
};

const contractLinks: ContractLink[] = [
  { label: "Factory", address: dexRegistry.factory },
  { label: "Router", address: dexRegistry.router },
  { label: "Incentives", address: dexRegistry.incentives },
  { label: "Oracle", address: dexRegistry.oracle },
  { label: "Registry", address: dexRegistry.nativeCoinRegistry },
];

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
                <Text as="p" className="eyebrow">Astroport Core · Juno mainnet</Text>
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

        <Box as="main" className="app-main" tabIndex={-1}>{children}</Box>

        <Box as="footer" className="app-footer">
          <RiskNotice variant="compact" />
          <Stack className="footer-grid" direction="horizontal" flexWrap="wrap">
            <Box className="footer-column">
              <Text as="p" className="eyebrow">Resources</Text>
              <a href="https://docs.astroport.fi/" target="_blank" rel="noreferrer">Astroport docs</a>
              <a href="https://github.com/JakeHartnell/astroport-core" target="_blank" rel="noreferrer">Source repository</a>
              <a href={dexRegistry.explorerBaseUrl} target="_blank" rel="noreferrer">Mintscan Juno</a>
            </Box>
            <Box className="footer-column footer-contracts">
              <Text as="p" className="eyebrow">Juno contracts</Text>
              {contractLinks.filter((contract) => contract.address).map((contract) => (
                <a key={contract.label} href={`${dexRegistry.explorerBaseUrl}/wasm/contract/${contract.address}`} target="_blank" rel="noreferrer">
                  <span>{contract.label}</span><code>{contract.address}</code>
                </a>
              ))}
            </Box>
          </Stack>
        </Box>
      </Box>
      </SlippageSettingsProvider>
    </WalletProvider>
  );
}
