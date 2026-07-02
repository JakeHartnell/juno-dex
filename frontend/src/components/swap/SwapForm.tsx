import { useMemo, useState } from "react";
import type { RegistryPool } from "../../config/registry";
import { formatAmount, toBaseAmount } from "../../lib/format/amounts";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { QuoteCard } from "./QuoteCard";
import { TokenSelect } from "./TokenSelect";

const DEFAULT_SLIPPAGE_PERCENT = 0.5;

export function SwapForm({ pool }: { pool: RegistryPool }) {
  const [offerId, setOfferId] = useState(pool.assets[0].id);
  const [amount, setAmount] = useState("1");
  const offerAsset = pool.assets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = useMemo(() => pool.assets.find((asset) => asset.id !== offerAsset.id) ?? pool.assets[1], [offerAsset.id, pool.assets]);
  const baseAmount = toBaseAmount(amount, offerAsset.decimals);
  const quote = useSwapQuote(pool, offerAsset, askAsset, baseAmount);
  const hasAmount = Number(baseAmount) > 0;
  const receiveAmount = quote.data ? `${formatAmount(quote.data.return_amount, askAsset.decimals)} ${askAsset.symbol}` : "—";
  const actionCopy = !hasAmount
    ? "Enter amount"
    : quote.isError
      ? "Quote unavailable"
      : quote.isFetching
        ? "Refreshing quote…"
        : quote.data
          ? "Swap disabled: preview mode"
          : "Connect Keplr to review swap";

  return (
    <div className="swap-card">
      <div className="swap-card-header">
        <div>
          <p className="eyebrow">Direct swap</p>
          <h2>{pool.assets[0].symbol} ↔ {pool.assets[1].symbol}</h2>
        </div>
        <button type="button" className="slippage-pill" title="Slippage settings are fixed in preview mode">Slippage {DEFAULT_SLIPPAGE_PERCENT}%</button>
      </div>
      <div className="mode-tabs" aria-label="Trade mode">
        <span className="mode-tab active">Direct pair</span>
        <span className="mode-tab disabled" title="Router execution is not enabled in v1 preview">Router later</span>
      </div>
      <div className="asset-amount-card">
        <div className="asset-card-topline"><span>From</span><strong>{offerAsset.symbol}</strong></div>
        <div className="form-grid">
          <label className="field compact-field">
            <span>Amount</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <TokenSelect assets={pool.assets} value={offerId} onChange={setOfferId} label="Asset" />
        </div>
        <code>{offerAsset.id}</code>
      </div>
      <div className="swap-direction">↓</div>
      <div className="asset-amount-card receive-card">
        <div className="asset-card-topline"><span>To · estimated receive</span><strong>{askAsset.symbol}</strong></div>
        <div className="estimated-receive">{receiveAmount}</div>
        <code>{askAsset.id}</code>
      </div>
      <QuoteCard quote={quote.data} askAsset={askAsset} isLoading={quote.isFetching} error={quote.error} pool={pool} slippagePercent={DEFAULT_SLIPPAGE_PERCENT} />
      <button type="button" className="primary-action" disabled>{actionCopy}</button>
    </div>
  );
}
