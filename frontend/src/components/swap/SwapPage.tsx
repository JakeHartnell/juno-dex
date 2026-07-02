import { Box, Stack, Text } from "@interchain-ui/react";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { EmptyState, ErrorState, Skeleton } from "../common";
import { SwapForm } from "./SwapForm";

export function SwapPage() {
  const { pools, discovery } = useDexRegistry();
  const pool = pools[0];

  return (
    <Box as="section" className="swap-page-grid">
      <Stack className="swap-primary" direction="vertical" space="6">
        {discovery.isFetching && !pool ? <div className="lp-position-skeleton" aria-label="Loading swap pools"><Skeleton width="75%" /><Skeleton width="55%" /></div> : null}
        {discovery.isError ? <ErrorState title="Pool discovery unavailable" error="Showing curated registry fallback only. Swap stays unavailable if no verified pool is present." onRetry={() => void discovery.refetch()} /> : null}
        {pool ? <SwapForm pool={pool} pools={pools} /> : <EmptyState title="No enabled verified pools">Add a real Juno pair to the strict registry before exposing swaps.</EmptyState>}
      </Stack>
      <Stack className="hero-panel context-panel" direction="vertical" space="8">
        <Box>
          <Text as="p" className="eyebrow">Swap</Text>
          <Text as="h2" variant="heading">Trade on Juno</Text>
          <Text as="p" color="textSecondary">Choose a pair, review the quote, and confirm in your wallet when ready.</Text>
        </Box>
      </Stack>
    </Box>
  );
}
