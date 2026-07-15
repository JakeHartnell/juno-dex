import { Box, Stack } from "@interchain-ui/react";
import { useCallback, useState } from "react";
import { useDexRegistry } from "../../queries/useDexRegistry";
import type { RegistryPool } from "../../config/registry";
import { EmptyState, ErrorState, OptionalDataState, Skeleton } from "../common";
import { SwapForm } from "./SwapForm";
import { PriceCandleChart } from "../charts/PriceCandleChart";

export function SwapPage() {
  const { pools, discovery } = useDexRegistry();
  const pool = pools[0];
  const [marketPair, setMarketPair] = useState<string>();
  const marketPool = pools.find((candidate) => candidate.pair === marketPair) ?? pool;
  const handleMarketPoolChange = useCallback((nextPool: RegistryPool) => setMarketPair(nextPool.pair), []);

  return (
    <Box as="section" className="swap-page-grid">
      <Stack className="swap-primary" direction="vertical" space="6">
        {discovery.isFetching && !pool ? <div className="lp-position-skeleton" role="status" aria-label="Loading swap pools"><Skeleton width="75%" /><Skeleton width="55%" /></div> : null}
        {discovery.isError && pool ? <OptionalDataState title="Some markets may be missing" onRetry={() => void discovery.refetch()}>The selected reviewed market remains available.</OptionalDataState> : null}
        {discovery.isError && !pool ? <ErrorState title="Markets could not be loaded" error="Swap is unavailable until a reviewed pool can be verified. Try again." onRetry={() => void discovery.refetch()} /> : null}
        {pool ? <SwapForm pool={pool} pools={pools} onMarketPoolChange={handleMarketPoolChange} /> : <EmptyState title="No enabled verified pools">Add a real Juno pair to the strict registry before exposing swaps.</EmptyState>}
      </Stack>
      {marketPool ? (
        <Stack className="context-panel market-panel" direction="vertical" space="6">
          <PriceCandleChart pool={marketPool} title={`${marketPool.assets[0].symbol} / ${marketPool.assets[1].symbol}`} compact showControls={false} limit={48} />
        </Stack>
      ) : null}
    </Box>
  );
}
