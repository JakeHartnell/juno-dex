import type { RouteQuote } from "../../queries/useSwapQuote";
import type { RegistryAsset } from "../../config/registry";
import { routeSymbols } from "../../lib/astroport/routes";
import { formatAmount } from "../../lib/format/amounts";
import { calculateMinimumReceived, formatBpsPercent, getPriceImpact } from "../../lib/swap/slippage";
import { EmptyState, ErrorState, ExplorerLink, Skeleton } from "../common";

export function QuoteCard({ quote, askAsset, isLoading, error, slippageBps }: { quote?: RouteQuote; askAsset?: RegistryAsset; isLoading: boolean; error?: unknown; slippageBps: number }) {
  const updatedAt = quote ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : undefined;
  const priceImpact = quote ? getPriceImpact({ spreadAmount: quote.spread_amount, returnAmount: quote.return_amount }) : null;
  const priceImpactClass = priceImpact?.severity === "high" ? "status-danger" : priceImpact?.severity === "warning" ? "status-warn" : "status-ok";
  const route = quote?.route;
  const isRouterRoute = quote?.source === "router";

  return (
    <section className="quote-card">
      <div className="quote-header">
        <span className="eyebrow">Quote details</span>
        {isLoading ? <span className="status-pill status-warn">refreshing</span> : quote ? <span className="status-pill status-ok">live</span> : <span className="status-pill">waiting</span>}
      </div>
      {isLoading ? <strong><Skeleton width="10rem" /> Querying route…</strong> : null}
      {error ? <ErrorState title="Route preview unavailable" error={error instanceof Error ? `${error.message}. Swaps stay disabled until a route can be simulated.` : `Swaps stay disabled until route simulation recovers. ${String(error)}`} /> : null}
      {quote && askAsset && route ? (
        <>
          <dl className="quote-details">
            <div><dt>Return</dt><dd className="quote-detail-value">{formatAmount(quote.return_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
            <div><dt>Minimum receive ({formatBpsPercent(slippageBps)})</dt><dd className="quote-detail-value">{formatAmount(calculateMinimumReceived(quote.return_amount, slippageBps), askAsset.decimals)} {askAsset.symbol}</dd></div>
            <div><dt>Price impact</dt><dd className={`quote-detail-value ${priceImpactClass}`}>{isRouterRoute ? "Router aggregate unavailable" : priceImpact ? formatBpsPercent(priceImpact.bps) : "—"}</dd></div>
            <div><dt>Spread</dt><dd className="quote-detail-value">{isRouterRoute ? "per-hop via router" : `${formatAmount(quote.spread_amount, askAsset.decimals)} ${askAsset.symbol}`}</dd></div>
            <div><dt>Commission / fee</dt><dd className="quote-detail-value">{isRouterRoute ? "included in router return" : `${formatAmount(quote.commission_amount, askAsset.decimals)} ${askAsset.symbol} · ${route.hops[0]?.pool.feeBps ?? 0} bps`}</dd></div>
            <div><dt>Route</dt><dd className="quote-detail-value">{routeSymbols(route)} · {route.hops.length} hop{route.hops.length === 1 ? "" : "s"}</dd></div>
            <div><dt>Hops</dt><dd className="quote-detail-value">{route.hops.map((hop, index) => <span key={`${hop.pool.pair}-${index}`}>{index > 0 ? " · " : ""}{hop.offerAsset.symbol}/{hop.askAsset.symbol} <ExplorerLink href={hop.pool.explorer}>{hop.pool.pair}</ExplorerLink></span>)}</dd></div>
            <div><dt>Source</dt><dd className="quote-detail-value">{isRouterRoute ? "router simulate_swap_operations" : "pair simulation"}{updatedAt ? ` · ${updatedAt}` : ""}</dd></div>
          </dl>
          {quote.errors?.length ? <p className="error-text">Some candidate routes could not be simulated: {quote.errors.join("; ")}</p> : null}
        </>
      ) : <EmptyState title="Waiting for amount">Enter an amount to quote the best direct or router path.</EmptyState>}
    </section>
  );
}
