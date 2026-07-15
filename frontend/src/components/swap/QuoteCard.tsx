import type { RouteQuote } from "../../queries/useSwapQuote";
import type { RegistryAsset } from "../../config/registry";
import { routeSymbols } from "../../lib/astroport/routes";
import { formatAmount } from "../../lib/format/amounts";
import { formatBpsPercent, getPriceImpact } from "../../lib/swap/slippage";
import { ErrorState } from "../common";

export function QuoteCard({
  quote,
  askAsset,
  offerAsset,
  isLoading,
  error,
  slippageBps,
  minimumReceive,
}: {
  quote?: RouteQuote;
  askAsset?: RegistryAsset;
  offerAsset?: RegistryAsset;
  isLoading: boolean;
  error?: unknown;
  slippageBps: number;
  minimumReceive?: string;
}) {
  const priceImpact = quote
    ? getPriceImpact({
        spreadAmount: quote.spread_amount,
        returnAmount: quote.return_amount,
      })
    : null;
  const isRouterRoute = quote?.source === "router";
  const priceImpactClass = isRouterRoute
    ? "status-warn"
    : priceImpact?.severity === "high" || priceImpact?.severity === "extreme"
      ? "status-danger"
      : priceImpact?.severity === "warning"
      ? "status-warn"
      : "status-ok";
  const route = quote?.route;
  const rateLabel =
    quote && offerAsset && askAsset
      ? `1 ${offerAsset.symbol} = ${(
          Number(
            formatAmount(quote.return_amount, askAsset.decimals).replace(
              /,/g,
              ""
            )
          ) /
          Number(
            formatAmount(quote.offer_amount, offerAsset.decimals).replace(
              /,/g,
              ""
            ) || "1"
          )
        ).toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${
          askAsset.symbol
        }`
      : "—";
  const maxSlippageLabel = formatBpsPercent(slippageBps);

  return (
    <section className={`quote-card${isLoading && quote ? " quote-card-updating" : ""}`} aria-busy={isLoading}>
      <span className="sr-only" aria-live="polite">{isLoading ? "Updating quote" : ""}</span>
      {error ? (
        <ErrorState
          title="Route preview unavailable"
          error={
            error instanceof Error
              ? `${error.message}. Swaps stay disabled until a route can be simulated.`
              : `Swaps stay disabled until route simulation recovers. ${String(
                  error
                )}`
          }
        />
      ) : null}
      {!quote && !error ? (
        <div className="quote-placeholder" role="status">{isLoading ? "Finding the best available route…" : "Enter an amount to preview rate, route, impact, and minimum received."}</div>
      ) : null}
      {quote && askAsset && route ? (
        <>
          <details className="quote-disclosure">
            <summary className="quote-rate">
              <span className="quote-rate-value">{rateLabel}</span>
              <span className="quote-disclosure-chevron" aria-hidden="true" />
            </summary>
            <dl className="quote-rows">
              {minimumReceive ? (
                <div>
                  <dt>Minimum received</dt>
                  <dd className="quote-row-value">{formatAmount(minimumReceive, askAsset.decimals)} {askAsset.symbol}</dd>
                </div>
              ) : null}
              <div>
                <dt>Price impact</dt>
                <dd className={`quote-row-value ${priceImpactClass}`}>
                  {isRouterRoute
                    ? "Unavailable"
                    : priceImpact
                    ? formatBpsPercent(priceImpact.bps)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Max slippage</dt>
                <dd className="quote-row-value">{maxSlippageLabel}</dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd className="quote-row-value route-value">
                  {routeSymbols(route)} · {route.hops.length} hop
                  {route.hops.length === 1 ? "" : "s"}
                </dd>
              </div>
            </dl>
          </details>
        </>
      ) : null}
    </section>
  );
}
