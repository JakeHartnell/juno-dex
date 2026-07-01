import type { SimulationResponse } from "../../lib/astroport/queries";
import type { RegistryAsset } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";

export function QuoteCard({ quote, askAsset, isLoading, error }: { quote?: SimulationResponse; askAsset?: RegistryAsset; isLoading: boolean; error?: unknown }) {
  return (
    <section className="quote-card">
      <span className="eyebrow">Read-only pair simulation</span>
      {isLoading ? <strong>Querying pair…</strong> : null}
      {error ? <p className="error-text">Quote unavailable: {error instanceof Error ? error.message : String(error)}</p> : null}
      {quote && askAsset ? (
        <dl>
          <div><dt>Return</dt><dd>{formatAmount(quote.return_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Spread</dt><dd>{formatAmount(quote.spread_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
          <div><dt>Commission</dt><dd>{formatAmount(quote.commission_amount, askAsset.decimals)} {askAsset.symbol}</dd></div>
        </dl>
      ) : <p>Enter an amount to quote the direct XYK pair.</p>}
    </section>
  );
}
