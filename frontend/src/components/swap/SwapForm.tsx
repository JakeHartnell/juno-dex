import { useEffect, useMemo, useState } from "react";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryAsset, RegistryPool } from "../../config/registry";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { formatBpsPercent, getPriceImpact, slippageBpsToMaxSpread } from "../../lib/swap/slippage";
import { useSwapTx } from "../../mutations/useSwapTx";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { TokenAmountInput } from "../common";
import { TxStatusDialog } from "../tx/TxStatusDialog";
import { QuoteCard } from "./QuoteCard";
import { TokenSelect } from "./TokenSelect";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

type SwapFormProps = {
  pool: RegistryPool;
  pools?: RegistryPool[];
};

function isPositiveBaseAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

function sameAsset(left: RegistryAsset, right: RegistryAsset) {
  return left.id === right.id;
}

function directPoolFor(pools: RegistryPool[], offerId: string, askId: string): RegistryPool | undefined {
  if (offerId === askId) return undefined;
  return pools.find((candidate) => candidate.assets.some((asset) => asset.id === offerId) && candidate.assets.some((asset) => asset.id === askId));
}

function buildSelectableAssets(pools: RegistryPool[]) {
  const byId = new Map<string, RegistryAsset & { verified?: boolean; poolCount: number }>();
  for (const candidatePool of pools) {
    for (const asset of candidatePool.assets) {
      const existing = byId.get(asset.id);
      byId.set(asset.id, {
        ...existing,
        ...asset,
        logoURI: existing?.logoURI ?? asset.logoURI,
        verified: existing?.verified ?? candidatePool.verified ?? candidatePool.source !== "factory",
        poolCount: (existing?.poolCount ?? 0) + 1,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function SwapForm({ pool, pools }: SwapFormProps) {
  const allPools = useMemo(() => pools && pools.length > 0 ? pools : [pool], [pool, pools]);
  const selectableAssets = useMemo(() => buildSelectableAssets(allPools), [allPools]);
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const [offerId, setOfferId] = useState(pool.assets[0].id);
  const [askId, setAskId] = useState(pool.assets[1].id);
  const [amount, setAmount] = useState("1");
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false);
  const { slippageBps, formattedSlippagePercent, maxSpread } = useSlippageSettings();
  const offerAsset = selectableAssets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = selectableAssets.find((asset) => asset.id === askId) ?? pool.assets[1];
  const selectedPool = directPoolFor(allPools, offerAsset.id, askAsset.id);
  const parsedAmount = parseTokenAmount(amount, offerAsset.decimals);
  const baseAmount = parsedAmount.baseAmount;
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, allPools);
  const offerBalance = getWalletBalanceAmount(balances.data, offerAsset.id);
  const quote = useSwapQuote(selectedPool, offerAsset, askAsset, baseAmount);
  const signerOrClient = wallet.status === "connected"
    ? (wallet.getSigningCosmWasmClient as SigningClientGetter | undefined) ?? (wallet.signer as OfflineSigner | undefined)
    : undefined;
  const swapTx = useSwapTx(signerOrClient, walletAddress);
  const hasAmount = parsedAmount.isValid && isPositiveBaseAmount(baseAmount);
  const exceedsBalance = Boolean(offerBalance && parsedAmount.isValid && isBaseAmountGreaterThan(baseAmount, offerBalance));
  const quoteReady = Boolean(selectedPool) && quote.isSuccess && Boolean(quote.data) && !quote.isFetching && !quote.isError;
  const receiveAmount = quote.data ? `${formatAmount(quote.data.return_amount, askAsset.decimals)} ${askAsset.symbol}` : "—";
  const priceImpact = quote.data ? getPriceImpact({ spreadAmount: quote.data.spread_amount, returnAmount: quote.data.return_amount }) : null;
  const requiresHighImpactConfirm = priceImpact?.severity === "high";
  useEffect(() => setHighImpactConfirmed(false), [baseAmount, offerAsset.id, askAsset.id, quote.data?.return_amount, quote.data?.spread_amount]);

  const validationError = !selectedPool
    ? sameAsset(offerAsset, askAsset)
      ? "Choose two different tokens"
      : `No direct pool route for ${offerAsset.symbol} → ${askAsset.symbol}`
    : !parsedAmount.isValid
      ? parsedAmount.error
      : !hasAmount
        ? "Enter amount"
        : exceedsBalance
          ? `Insufficient ${offerAsset.symbol} balance`
          : quote.isError
            ? "Quote unavailable"
            : quote.isFetching || (hasAmount && !quoteReady)
              ? "Refreshing quote…"
              : requiresHighImpactConfirm && !highImpactConfirmed
                ? "Confirm high price impact"
                : undefined;
  const submitDisabled = wallet.status !== "connected"
    || !network.isJunoReady
    || network.isWrongNetwork
    || Boolean(validationError)
    || swapTx.isPending;
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to swap"
    : wallet.status === "connected" && !network.isJunoReady
      ? "Juno network required"
      : wallet.status !== "connected"
        ? "Connect wallet to swap"
        : swapTx.isPending
          ? "Swapping…"
          : validationError ?? "Swap";

  const handleSwap = () => {
    if (submitDisabled || !selectedPool) return;
    swapTx.mutate({ pool: selectedPool, offerAsset, askAsset, amount: baseAmount, maxSpread: maxSpread || slippageBpsToMaxSpread(slippageBps) });
  };

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
        <span className="mode-tab disabled" title="Router execution is not enabled for direct-pair v1">Router later</span>
      </Box>
      <Stack className="asset-amount-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>From</span><strong>{offerAsset.symbol}</strong></Stack>
        <Stack className="form-grid" direction="horizontal" align="flex-end">
          <TokenAmountInput
            label="Amount"
            value={amount}
            decimals={offerAsset.decimals}
            symbol={offerAsset.symbol}
            balanceBaseAmount={offerBalance}
            onChange={(nextAmount) => setAmount(nextAmount)}
            fiatHint={<span>USD hint pending oracle wiring</span>}
          />
          <TokenSelect assets={selectableAssets} value={offerId} onChange={setOfferId} label="From asset" balances={balances.data} />
        </Stack>
        <code>{offerAsset.id}</code>
      </Stack>
      <Box className="swap-direction">↓</Box>
      <Stack className="asset-amount-card receive-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>To · estimated receive</span><strong>{askAsset.symbol}</strong></Stack>
        <TokenSelect assets={selectableAssets} value={askId} onChange={setAskId} label="To asset" balances={balances.data} />
        <Text as="div" className="estimated-receive">{receiveAmount}</Text>
        <code>{askAsset.id}</code>
      </Stack>
      {!selectedPool ? <div className="error-text" role="status">No supported direct pool route is available for this token pair. Choose a listed pool pair to continue.</div> : null}
      <QuoteCard quote={quote.data} askAsset={askAsset} isLoading={Boolean(selectedPool) && quote.isFetching} error={quote.error} pool={selectedPool ?? pool} slippageBps={slippageBps} />
      {priceImpact?.severity === "warning" ? (
        <div className="price-impact-warning" role="status">Price impact is elevated at {formatBpsPercent(priceImpact.bps)}. Review size and pool liquidity before swapping.</div>
      ) : null}
      {requiresHighImpactConfirm ? (
        <label className="price-impact-warning price-impact-danger">
          <input type="checkbox" checked={highImpactConfirmed} onChange={(event) => setHighImpactConfirmed(event.target.checked)} />
          I understand this quote has high price impact ({formatBpsPercent(priceImpact.bps)}).
        </label>
      ) : null}
      {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
      {validationError && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validationError}</Text> : null}
      {swapTx.isError ? <Text as="p" className="error-text">{swapTx.error instanceof Error ? swapTx.error.message : "Swap failed"}</Text> : null}
      {swapTx.isSuccess ? <Text as="p" className="success-text">Swap transaction broadcast. Balances, quote, and pool reserves are refreshing.</Text> : null}
      <Box className="empty-state compact">
        <strong>Experimental thin-liquidity pool</strong>
        <p>Direct swaps execute against the live pair. Review price impact, fees, and slippage before signing; this test market can move sharply.</p>
      </Box>
      <TxStatusDialog state={swapTx.txState} />
      <Button intent="primary" className="primary-action" disabled={submitDisabled} fluidWidth onClick={handleSwap} domAttributes={{ type: "button" }}>{actionCopy}</Button>
    </Stack>
  );
}
