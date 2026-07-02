import { useMemo, useState } from "react";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryPool } from "../../config/registry";
import { formatAmount, toBaseAmount } from "../../lib/format/amounts";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { TokenAmountInput } from "../common";
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
    <Stack className="swap-card" direction="vertical" space="6">
      <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
        <Box>
          <Text as="p" className="eyebrow">Direct swap</Text>
          <Text as="h2" variant="heading">{pool.assets[0].symbol} ↔ {pool.assets[1].symbol}</Text>
        </Box>
        <Button variant="outlined" intent="secondary" size="sm" className="slippage-pill" domAttributes={{ type: "button", title: "Slippage settings are fixed in preview mode" }}>Slippage {DEFAULT_SLIPPAGE_PERCENT}%</Button>
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
      <QuoteCard quote={quote.data} askAsset={askAsset} isLoading={quote.isFetching} error={quote.error} pool={pool} slippagePercent={DEFAULT_SLIPPAGE_PERCENT} />
      <Button intent="primary" className="primary-action" disabled fluidWidth domAttributes={{ type: "button" }}>{actionCopy}</Button>
    </Stack>
  );
}
