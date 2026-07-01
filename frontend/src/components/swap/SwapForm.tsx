import { useMemo, useState } from "react";
import type { RegistryPool } from "../../config/registry";
import { toBaseAmount } from "../../lib/format/amounts";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { QuoteCard } from "./QuoteCard";
import { TokenSelect } from "./TokenSelect";

export function SwapForm({ pool }: { pool: RegistryPool }) {
  const [offerId, setOfferId] = useState(pool.assets[0].id);
  const [amount, setAmount] = useState("1");
  const offerAsset = pool.assets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = useMemo(() => pool.assets.find((asset) => asset.id !== offerAsset.id) ?? pool.assets[1], [offerAsset.id, pool.assets]);
  const baseAmount = toBaseAmount(amount, offerAsset.decimals);
  const quote = useSwapQuote(pool, offerAsset, askAsset, baseAmount);

  return (
    <div className="swap-card">
      <div className="form-grid">
        <label className="field">
          <span>Offer amount</span>
          <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <TokenSelect assets={pool.assets} value={offerId} onChange={setOfferId} label="Offer asset" />
      </div>
      <div className="swap-direction">↓</div>
      <div className="receive-box">
        <span>Ask asset</span>
        <strong>{askAsset.symbol}</strong>
        <code>{askAsset.id}</code>
      </div>
      <QuoteCard quote={quote.data} askAsset={askAsset} isLoading={quote.isFetching} error={quote.error} />
      <button type="button" className="primary-action" disabled>Broadcast swap (connect wallet flow wired, disabled for preview)</button>
    </div>
  );
}
