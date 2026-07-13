import { Box, Stack } from "@interchain-ui/react";
import { useCallback, useState } from "react";
import { useDexRegistry } from "../../queries/useDexRegistry";
import type { RegistryPool } from "../../config/registry";
import { EmptyState, ErrorState, Skeleton } from "../common";
import { SwapForm } from "./SwapForm";
import { PriceCandleChart } from "../charts/PriceCandleChart";
import { usePoolActivity } from "../../queries/usePools";
import { formatAssetFlow, formatTimestamp } from "../wallet/WalletTransactionHistory";
import { dexRegistry } from "../../config/registry";
import { ExplorerLink } from "../common";

export function SwapPage() {
  const { pools, discovery } = useDexRegistry();
  const pool = pools[0];
  const [marketPair, setMarketPair] = useState<string>();
  const marketPool = pools.find((candidate) => candidate.pair === marketPair) ?? pool;
  const handleMarketPoolChange = useCallback((nextPool: RegistryPool) => setMarketPair(nextPool.pair), []);

  return (
    <Box as="section" className="swap-page-grid">
      <Stack className="swap-primary" direction="vertical" space="6">
        {discovery.isFetching && !pool ? <div className="lp-position-skeleton" aria-label="Loading swap pools"><Skeleton width="75%" /><Skeleton width="55%" /></div> : null}
        {discovery.isError ? <ErrorState title="Pool discovery unavailable" error="Showing curated registry fallback only. Swap stays unavailable if no verified pool is present." onRetry={() => void discovery.refetch()} /> : null}
        {pool ? <SwapForm pool={pool} pools={pools} onMarketPoolChange={handleMarketPoolChange} /> : <EmptyState title="No enabled verified pools">Add a real Juno pair to the strict registry before exposing swaps.</EmptyState>}
      </Stack>
      {marketPool ? <MarketPanel pool={marketPool} /> : null}
    </Box>
  );
}

function MarketPanel({ pool }: { pool: RegistryPool }) {
  const activity = usePoolActivity(pool, 10);
  return (
    <Stack className="context-panel market-panel" direction="vertical" space="6">
      <PriceCandleChart pool={pool} title={`${pool.assets[0].symbol} / ${pool.assets[1].symbol}`} compact showControls={false} limit={48} />
      <Box className="market-card transmissions-card">
        <div className="market-activity-heading"><div><p className="eyebrow">Market activity</p><h3>Recent transactions</h3></div><span>Last 10</span></div>
        {activity.isLoading ? <p className="pool-metrics-copy">Loading recent activity…</p> : null}
        {!activity.isLoading && activity.access?.error ? <p className="pool-metrics-copy">Recent activity is temporarily unavailable.</p> : null}
        {!activity.isLoading && !activity.access?.error && activity.data.length === 0 ? <p className="pool-metrics-copy">No recent transactions for this market.</p> : null}
        <div className="transaction-list">
          {activity.data.map((tx) => (
            <div className="transaction-row" key={`${tx.txHash}-${tx.type}-${tx.height}`}>
              <span className={`transaction-kind ${tx.type}`} aria-hidden="true">{tx.type === "provide_liquidity" ? "+" : tx.type === "withdraw_liquidity" ? "−" : "⇄"}</span>
              <div><strong>{formatAssetFlow(tx, pool)}</strong><small>{formatTimestamp(tx.timestamp)}</small></div>
              <ExplorerLink href={`${dexRegistry.explorerBaseUrl}/tx/${tx.txHash}`}>View</ExplorerLink>
            </div>
          ))}
        </div>
      </Box>
    </Stack>
  );
}
