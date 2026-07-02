import type { SimulationResponse } from "../../lib/astroport/queries";
import type { RegistryAsset, RegistryPool } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { calculateMinimumReceived, formatBpsPercent, getPriceImpact } from "../../lib/swap/slippage";
import { EmptyState, ErrorState, ExplorerLink, Skeleton } from "../common";

export function QuoteCard({ quote, askAsset, isLoading, error, pool, slippageBps }: { quote?: SimulationResponse; askAsset?: RegistryAsset; isLoading: boolean; error?: unknown; pool: RegistryPool; slippageBps: number }) {
  const updatedAt = quote ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined;
  const priceImpact = quote ? getPriceImpact({ spreadAmount: quote.spread_amount, returnAmount: quote.return_amount }) : null;
  const priceImpactClass = priceImpact?.severity === "high" ? "status-danger" : priceImpact?.severity === "warning" ? "status-warn" : "status-ok";
  return (
    <section className="quote-card">
      <div className="quote-header">
        <span className="eyebrow">Quote details</span>
        {isLoading ? <span className="status-pill status-warn">refreshing</span> : quote ? <span className="status-pill status-ok">live</span> : <span className="status-pill">waiting</span>}
      </div>
      {isLoading ? <strong><Skeleton width="10rem" /> Querying pair…</strong> : null}
      {error ? <ErrorState title="Quote unavailable" error={error instanceof Error ? `${error.message}. Keep registry data visible; do not submit until simulation recovers.` : `Keep registry data visible; do not submit until simulation recovers. ${String(error)}`} /> : null}
      {quote && askAsset ? (
        <dl className="quote-details">
          <div><dt>Return</dt><dd className="quote-detail-value">{formatAmount(quote.return_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Minimum receive ({formatBpsPercent(slippageBps)})</dt><dd className="quote-detail-value">{formatAmount(calculateMinimumReceived(quote.return_amount, slippageBps), askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Price impact</dt><dd className={`quote-detail-value ${priceImpactClass}`}>{priceImpact ? formatBpsPercent(priceImpact.bps) : "—"}</dd></div>
          <div><dt>Spread</dt><dd className="quote-detail-value">{formatAmount(quote.spread_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Commission / fee</dt><dd className="quote-detail-value">{formatAmount(quote.commission_amount, askAsset.decimals)} {askAsset.symbol} · {pool.feeBps} bps</dd></div>
          <div><dt>Route</dt><dd className="quote-detail-value">Direct XYK pair only</dd></div>
          <div><dt>Pair</dt><dd className="quote-detail-value"><ExplorerLink href={pool.explorer}>{pool.pair}</ExplorerLink></dd></div>
          <div><dt>Source</dt><dd className="quote-detail-value">pair simulation{updatedAt ? ` · ${updatedAt}` : ""}</dd></div>
        </dl>
      ) : <EmptyState title="Waiting for amount">Enter an amount to quote the direct XYK pair.</EmptyState>}
    </section>
  );
}
