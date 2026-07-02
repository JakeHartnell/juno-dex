import { useEffect, useMemo, useState } from "react";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryPool } from "../../config/registry";
import { formatAmount, toBaseAmount } from "../../lib/format/amounts";
import { formatBpsPercent, getPriceImpact } from "../../lib/swap/slippage";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { TokenAmountInput } from "../common";
import { QuoteCard } from "./QuoteCard";
import { TokenSelect } from "./TokenSelect";

export function SwapForm({ pool }: { pool: RegistryPool }) {
  const [offerId, setOfferId] = useState(pool.assets[0].id);
  const [amount, setAmount] = useState("1");
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false);
  const { slippageBps, formattedSlippagePercent, maxSpread } = useSlippageSettings();
  const offerAsset = pool.assets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = useMemo(() => pool.assets.find((asset) => asset.id !== offerAsset.id) ?? pool.assets[1], [offerAsset.id, pool.assets]);
  const baseAmount = toBaseAmount(amount, offerAsset.decimals);
  const quote = useSwapQuote(pool, offerAsset, askAsset, baseAmount);
  const hasAmount = Number(baseAmount) > 0;
  const receiveAmount = quote.data ? `${formatAmount(quote.data.return_amount, askAsset.decimals)} ${askAsset.symbol}` : "—";
  const priceImpact = quote.data ? getPriceImpact({ spreadAmount: quote.data.spread_amount, returnAmount: quote.data.return_amount }) : null;
  const requiresHighImpactConfirm = priceImpact?.severity === "high";
  useEffect(() => setHighImpactConfirmed(false), [baseAmount, offerAsset.id, askAsset.id, quote.data?.return_amount, quote.data?.spread_amount]);
  const actionCopy = !hasAmount
    ? "Enter amount"
    : quote.isError
      ? "Quote unavailable"
      : quote.isFetching
        ? "Refreshing quote…"
        : requiresHighImpactConfirm && !highImpactConfirmed
          ? "Confirm high price impact"
        : quote.data
          ? "Swap disabled: preview mode"
          : "Connect wallet to review swap";

  return (
    <Stack className="swap-card" direction="vertical" space="6">
      <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
        <Box>
          <Text as="p" className="eyebrow">Direct swap</Text>
          <Text as="h2" variant="heading">{pool.assets[0].symbol} ↔ {pool.assets[1].symbol}</Text>
        </Box>
        <Button variant="outlined" intent="secondary" size="sm" className="slippage-pill" domAttributes={{ type: "button", title: `Swap max_spread ${maxSpread}` }}>Slippage {formattedSlippagePercent}%</Button>
      </Stack>
      <Box className="mode-tabs" aria-label="Trade mode">
        <span className="mode-tab active">Direct pair</span>
        <span className="mode-tab disabled" title="Router execution is not enabled in v1 preview">Router later</span>
      </Box>
      <Stack className="asset-amount-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>From</span><strong>{offerAsset.symbol}</strong></Stack>
        <Stack className="form-grid" direction="horizontal" align="flex-end">
          <TokenAmountInput
            label="Amount"
            value={amount}
            decimals={offerAsset.decimals}
            symbol={offerAsset.symbol}
            onChange={(nextAmount) => setAmount(nextAmount)}
            fiatHint={<span>USD hint pending oracle wiring</span>}
          />
          <TokenSelect assets={pool.assets} value={offerId} onChange={setOfferId} label="Asset" />
        </Stack>
        <code>{offerAsset.id}</code>
      </Stack>
      <Box className="swap-direction">↓</Box>
      <Stack className="asset-amount-card receive-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>To · estimated receive</span><strong>{askAsset.symbol}</strong></Stack>
        <Text as="div" className="estimated-receive">{receiveAmount}</Text>
        <code>{askAsset.id}</code>
      </Stack>
      <QuoteCard quote={quote.data} askAsset={askAsset} isLoading={quote.isFetching} error={quote.error} pool={pool} slippageBps={slippageBps} />
      {priceImpact?.severity === "warning" ? (
        <div className="price-impact-warning" role="status">Price impact is elevated at {formatBpsPercent(priceImpact.bps)}. Review size and pool liquidity before swapping.</div>
      ) : null}
      {requiresHighImpactConfirm ? (
        <label className="price-impact-warning price-impact-danger">
          <input type="checkbox" checked={highImpactConfirmed} onChange={(event) => setHighImpactConfirmed(event.target.checked)} />
          I understand this quote has high price impact ({formatBpsPercent(priceImpact.bps)}).
        </label>
      ) : null}
      <Button intent="primary" className="primary-action" disabled fluidWidth domAttributes={{ type: "button" }}>{actionCopy}</Button>
    </Stack>
  );
}
