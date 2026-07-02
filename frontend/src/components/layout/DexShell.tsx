import type { ReactNode } from "react";
import { Box, Stack, Text } from "@interchain-ui/react";
import junoLogo from "../../assets/juno-dex-logo.svg";
import { dexRegistry } from "../../config/registry";
import { WalletProvider } from "../../wallet/WalletContext";
import { ChainStatusBadge } from "../wallet/ChainStatusBadge";
import { WalletConnectButton } from "../wallet/WalletConnectButton";

export function DexShell({ children, navigation }: { children: ReactNode; navigation: ReactNode }) {
  return (
    <WalletProvider>
      <Box className="dex-shell">
        <Stack as="header" className="topbar" direction="horizontal" align="center" justify="space-between">
          <Stack className="brand-lockup" direction="horizontal" align="center" space="8">
            <img className="brand-logo" src={junoLogo} alt="Juno DEX" />
            <Box>
              <Text as="p" className="eyebrow">Astroport Core · Juno mainnet</Text>
              <Text as="h1" variant="heading" className="brand-title">Juno DEX</Text>
            </Box>
          </Stack>
          <Stack className="topbar-actions" direction="horizontal" align="center" justify="flex-end" flexWrap="wrap">
            <ChainStatusBadge rpcEndpoint={dexRegistry.rpcEndpoint} />
            <WalletConnectButton />
          </Stack>
        </Stack>
        <Stack as="nav" className="nav-tabs" direction="horizontal" flexWrap="wrap">{navigation}</Stack>
        <main>{children}</main>
      </Box>
    </WalletProvider>
  );
}
