import { Box, Stack, Text } from "@interchain-ui/react";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { EmptyState, ExplorerLink, RiskNotice } from "../common";
import { SwapForm } from "./SwapForm";

export function SwapPage() {
  const { pools, registry } = useDexRegistry();
  const pool = pools[0];

  return (
    <Box as="section" className="swap-page-grid">
      <Stack className="swap-primary" direction="vertical" space="6">
        <RiskNotice variant="compact" />
        {pool ? <SwapForm pool={pool} /> : <EmptyState title="No enabled verified pools">Add a real Juno pair to the strict registry before exposing swaps.</EmptyState>}
      </Stack>
      <Stack className="hero-panel context-panel" direction="vertical" space="8">
        <Box>
          <Text as="p" className="eyebrow">Juno utility terminal</Text>
          <Text as="h2" variant="heading">Verified Juno deployment</Text>
          <Text as="p" color="textSecondary">Strict registry, live pair simulation, visible denoms, visible contracts. This is an experimental thin-liquidity tool, not a launch-market dashboard.</Text>
        </Box>
        <Stack className="contract-strip" direction="horizontal" align="center" flexWrap="wrap">
          <Text as="span" fontWeight="bold">Factory</Text><code>{registry.factory}</code>
          <ExplorerLink href={`${registry.explorerBaseUrl}/wasm/contract/${registry.factory}`}>Mintscan</ExplorerLink>
        </Stack>
        {pool ? (
          <Stack className="contract-strip" direction="horizontal" align="center" flexWrap="wrap">
            <Text as="span" fontWeight="bold">Direct pair</Text><code>{pool.pair}</code>
            <ExplorerLink href={pool.explorer}>Mintscan</ExplorerLink>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
