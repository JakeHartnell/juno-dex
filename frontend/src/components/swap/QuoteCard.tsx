import type { SimulationResponse } from "../../lib/astroport/queries";
import type { RegistryAsset, RegistryPool } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { ExplorerLink } from "../common/ExplorerLink";

function minimumReceive(returnAmount: string, slippagePercent: number): string {
  const basisPoints = BigInt(Math.round((100 - slippagePercent) * 100));
  return ((BigInt(returnAmount) * basisPoints) / 10_000n).toString();
}

export function QuoteCard({ quote, askAsset, isLoading, error, pool, slippagePercent }: { quote?: SimulationResponse; askAsset?: RegistryAsset; isLoading: boolean; error?: unknown; pool: RegistryPool; slippagePercent: number }) {
  const updatedAt = quote ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined;
  return (
    <section className="quote-card">
      <div className="quote-header">
        <span className="eyebrow">Quote details</span>
        {isLoading ? <span className="status-pill status-warn">refreshing</span> : quote ? <span className="status-pill status-ok">live</span> : <span className="status-pill">waiting</span>}
      </div>
      {isLoading ? <strong>Querying pair…</strong> : null}
      {error ? <p className="error-text">Quote unavailable: {error instanceof Error ? error.message : String(error)}. Keep registry data visible; do not submit until simulation recovers.</p> : null}
      {quote && askAsset ? (
        <dl className="quote-details">
          <div><dt>Return</dt><dd className="quote-detail-value">{formatAmount(quote.return_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Minimum receive ({slippagePercent}%)</dt><dd className="quote-detail-value">{formatAmount(minimumReceive(quote.return_amount, slippagePercent), askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Spread</dt><dd className="quote-detail-value">{formatAmount(quote.spread_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Commission / fee</dt><dd className="quote-detail-value">{formatAmount(quote.commission_amount, askAsset.decimals)} {askAsset.symbol} · {pool.feeBps} bps</dd></div>
          <div><dt>Route</dt><dd className="quote-detail-value">Direct XYK pair only</dd></div>
          <div><dt>Pair</dt><dd className="quote-detail-value"><ExplorerLink href={pool.explorer}>{pool.pair}</ExplorerLink></dd></div>
          <div><dt>Source</dt><dd className="quote-detail-value">pair simulation{updatedAt ? ` · ${updatedAt}` : ""}</dd></div>
        </dl>
      ) : <p>Enter an amount to quote the direct XYK pair.</p>}
    </section>
  );
}
