import { useEffect, useMemo, useState } from "react";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import { dexRegistry, type RegistryAsset, type RegistryPool } from "../../config/registry";
import type { SwapQuoteMode } from "../../lib/astroport/queries";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { assessRouteRisk } from "../../lib/risk";
import { calculateMinimumReceived, formatBpsPercent, getPriceImpact, slippageBpsToMaxSpread } from "../../lib/swap/slippage";
import { useSwapTx } from "../../mutations/useSwapTx";
import { useSwapQuote } from "../../queries/useSwapQuote";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { RiskAcknowledgement, TokenAmountInput, TokenLogo } from "../common";
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
  const [askAmount, setAskAmount] = useState("");
  const [quoteMode, setQuoteMode] = useState<SwapQuoteMode>("exact-in");
  const [highImpactConfirmed, setHighImpactConfirmed] = useState(false);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const { slippageBps, formattedSlippagePercent, maxSpread } = useSlippageSettings();
  const offerAsset = selectableAssets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = selectableAssets.find((asset) => asset.id === askId && asset.id !== offerAsset.id) ?? selectableAssets.find((asset) => asset.id !== offerAsset.id) ?? pool.assets[1];
  const parsedOfferInput = parseTokenAmount(amount, offerAsset.decimals);
  const parsedAskInput = parseTokenAmount(askAmount, askAsset.decimals);
  const quoteInputBaseAmount = quoteMode === "exact-out" ? parsedAskInput.baseAmount : parsedOfferInput.baseAmount;
  const activeParsedAmount = quoteMode === "exact-out" ? parsedAskInput : parsedOfferInput;
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, allPools);
  const offerBalance = getWalletBalanceAmount(balances.data, offerAsset.id);
  const quote = useSwapQuote(allPools, offerAsset, askAsset, quoteInputBaseAmount, quoteMode);
  const signerOrClient = wallet.status === "connected"
    ? (wallet.getSigningCosmWasmClient as SigningClientGetter | undefined) ?? (wallet.signer as OfflineSigner | undefined)
    : undefined;
  const swapTx = useSwapTx(signerOrClient, walletAddress);
  const requiredOfferBaseAmount = quoteMode === "exact-out" && quote.data ? quote.data.offer_amount : parsedOfferInput.baseAmount;
  const hasAmount = activeParsedAmount.isValid && isPositiveBaseAmount(quoteInputBaseAmount);
  const sameToken = offerAsset.id === askAsset.id;
  const exceedsBalance = Boolean(offerBalance && isPositiveBaseAmount(requiredOfferBaseAmount) && isBaseAmountGreaterThan(requiredOfferBaseAmount, offerBalance));
  const quoteReady = quote.isSuccess && Boolean(quote.data) && !quote.isFetching && !quote.isError && !quote.isDebouncing && !quote.isExpired;
  const receiveAmount = quote.data
    ? `${formatAmount(quote.data.return_amount, askAsset.decimals)} ${askAsset.symbol}`
    : quoteMode === "exact-out" && parsedAskInput.isValid && isPositiveBaseAmount(parsedAskInput.baseAmount)
      ? `${askAmount} ${askAsset.symbol}`
      : "—";
  const priceImpact = quote.data && quote.data.source === "pair" ? getPriceImpact({ spreadAmount: quote.data.spread_amount, returnAmount: quote.data.return_amount }) : null;
  const requiresHighImpactConfirm = priceImpact?.severity === "high";
  const selectedRoute = quote.data?.route;
  const routeRisk = assessRouteRisk(selectedRoute);
  const minimumReceive = quote.data ? calculateMinimumReceived(quote.data.return_amount, slippageBps) : "0";
  useEffect(() => setHighImpactConfirmed(false), [quoteInputBaseAmount, quoteMode, offerAsset.id, askAsset.id, quote.data?.return_amount, quote.data?.spread_amount]);
  useEffect(() => setRiskAcknowledged(false), [quoteInputBaseAmount, quoteMode, offerAsset.id, askAsset.id, selectedRoute?.id]);

  const validationError = !activeParsedAmount.isValid
    ? activeParsedAmount.error
    : sameToken
      ? "Choose two different tokens"
      : !hasAmount
        ? "Enter amount"
        : quote.isDebouncing
          ? "Updating quote…"
          : exceedsBalance
            ? `Insufficient ${offerAsset.symbol} balance`
            : quote.isError
              ? "Route preview unavailable"
              : quote.isExpired
                ? "Quote expired — refresh"
                : quote.isFetching || (hasAmount && !quoteReady)
                  ? "Refreshing route…"
                  : !selectedRoute
                    ? "No route found"
                    : requiresHighImpactConfirm && !highImpactConfirmed
                      ? "Confirm high price impact"
                      : routeRisk.requiresAcknowledgement && !riskAcknowledged
                        ? "Acknowledge unverified route"
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
          : validationError ?? (quoteMode === "exact-out" ? "Swap exact output" : "Swap");

  const updateOfferAmount = (nextAmount: string) => {
    setAmount(nextAmount);
    setQuoteMode("exact-in");
  };

  const updateAskAmount = (nextAmount: string) => {
    setAskAmount(nextAmount);
    setQuoteMode("exact-out");
  };

  const handleOfferChange = (next: string) => {
    setOfferId(next);
    if (next === askId) setAskId(selectableAssets.find((asset) => asset.id !== next)?.id ?? askId);
    setQuoteMode("exact-in");
  };

  const handleFlip = () => {
    const nextOfferAmount = quote.data?.return_amount ? formatAmount(quote.data.return_amount, askAsset.decimals) : askAmount;
    setOfferId(askAsset.id);
    setAskId(offerAsset.id);
    setAmount(nextOfferAmount || "");
    setAskAmount("");
    setQuoteMode("exact-in");
  };

  const handleSwap = () => {
    if (submitDisabled || !selectedRoute || !quote.data) return;
    swapTx.mutate({
      pool: selectedRoute.hops[0]?.pool,
      route: selectedRoute,
      offerAsset,
      askAsset,
      amount: requiredOfferBaseAmount,
      maxSpread: maxSpread || slippageBpsToMaxSpread(slippageBps),
      minimumReceive,
      source: quote.data.source,
    });
  };

  return (
    <Stack className="swap-card" direction="vertical" space="6">
      <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
        <Box>
          <Text as="p" className="eyebrow">Smart swap</Text>
          <Text as="h2" variant="heading">Best direct or router route</Text>
        </Box>
        <Button variant="outlined" intent="secondary" size="sm" className="slippage-pill" domAttributes={{ type: "button", title: `Swap max_spread ${maxSpread}` }}>Slippage {formattedSlippagePercent}%</Button>
      </Stack>
      <Box className="mode-tabs" aria-label="Trade mode">
        <span className={`mode-tab ${quote.data?.source === "pair" ? "active" : ""}`}>Direct pair</span>
        <span className={`mode-tab ${quote.data?.source === "router" ? "active" : dexRegistry.router ? "" : "disabled"}`} title={dexRegistry.router ? "Router is used when it returns the best route" : "Router contract is not configured"}>Router</span>
      </Box>
      <Stack className="asset-amount-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>From {quoteMode === "exact-out" ? "· required input" : ""}</span><strong className="asset-card-token"><TokenLogo asset={offerAsset} size="sm" /> {offerAsset.name ?? offerAsset.symbol}</strong></Stack>
        <Stack className="form-grid" direction="horizontal" align="flex-end">
          <TokenAmountInput
            label={quoteMode === "exact-out" ? "Required amount" : "Amount"}
            value={quoteMode === "exact-out" && quote.data ? formatAmount(quote.data.offer_amount, offerAsset.decimals) : amount}
            decimals={offerAsset.decimals}
            symbol={offerAsset.symbol}
            balanceBaseAmount={offerBalance}
            onChange={updateOfferAmount}
            fiatHint={<span>{quoteMode === "exact-out" && quote.data ? "Calculated from reverse simulation" : "USD hint pending oracle wiring"}</span>}
          />
          <TokenSelect assets={selectableAssets} value={offerId} onChange={handleOfferChange} label="From asset" balances={balances.data} />
        </Stack>
        <code>{offerAsset.id}</code>
      </Stack>
      <Button variant="outlined" intent="secondary" size="sm" className="swap-direction" onClick={handleFlip} domAttributes={{ type: "button", title: "Flip swap direction" }}>↓</Button>
      <Stack className="asset-amount-card receive-card" direction="vertical" space="4">
        <Stack className="asset-card-topline" direction="horizontal" justify="space-between"><span>To {quoteMode === "exact-out" ? "· exact receive" : "· estimated receive"}</span><strong className="asset-card-token"><TokenLogo asset={askAsset} size="sm" /> {askAsset.name ?? askAsset.symbol}</strong></Stack>
        <TokenSelect assets={selectableAssets.filter((asset) => asset.id !== offerAsset.id)} value={askAsset.id} onChange={(next) => { setAskId(next); setQuoteMode("exact-in"); }} label="To asset" balances={balances.data} />
        <TokenAmountInput
          label={quoteMode === "exact-out" ? "Exact receive" : "Estimated receive"}
          value={quoteMode === "exact-out" ? askAmount : quote.data ? formatAmount(quote.data.return_amount, askAsset.decimals) : ""}
          decimals={askAsset.decimals}
          symbol={askAsset.symbol}
          onChange={updateAskAmount}
          fiatHint={<span>{receiveAmount}</span>}
        />
        <code>{askAsset.id}</code>
      </Stack>
      <QuoteCard quote={quote.data} askAsset={askAsset} offerAsset={offerAsset} isLoading={quote.isFetching || quote.isDebouncing} error={quote.error} slippageBps={slippageBps} updatedAt={quote.quoteUpdatedAt} expiresInMs={quote.expiresInMs} isExpired={quote.isExpired} onRefresh={() => void quote.refreshQuote()} />
      {quote.data?.source === "router" ? (
        <div className="price-impact-warning" role="status">Multi-hop routes touch multiple pools and may have higher execution risk. The router quote includes per-hop fees, but aggregate price impact is not exposed by this contract query.</div>
      ) : null}
      {selectedRoute?.hops.some((hop) => hop.pool.type !== "xyk") ? (
        <div className="price-impact-warning" role="status">Stable and PCL swaps rely on on-chain simulation for invariant math. The app displays contract-returned pricing and disables unsupported local liquidity math.</div>
      ) : null}
      {priceImpact?.severity === "warning" ? (
        <div className="price-impact-warning" role="status">Price impact is elevated at {formatBpsPercent(priceImpact.bps)}. Review size and pool liquidity before swapping.</div>
      ) : null}
      {requiresHighImpactConfirm ? (
        <label className="price-impact-warning price-impact-danger">
          <input type="checkbox" checked={highImpactConfirmed} onChange={(event) => setHighImpactConfirmed(event.target.checked)} />
          I understand this quote has high price impact ({formatBpsPercent(priceImpact.bps)}).
        </label>
      ) : null}
      <RiskAcknowledgement assessment={routeRisk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="swap route" />
      {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
      {validationError && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validationError}</Text> : null}
      {swapTx.isError ? <Text as="p" className="error-text">{swapTx.error instanceof Error ? swapTx.error.message : "Swap failed"}</Text> : null}
      {swapTx.isSuccess ? <Text as="p" className="success-text">Swap transaction broadcast. Balances, route quote, and pool reserves are refreshing.</Text> : null}
      <Box className="empty-state compact">
        <strong>Experimental thin-liquidity routing</strong>
        <p>Swaps execute against live Astroport pairs or the router. Review route hops, fees, price impact, and slippage before signing; test markets can move sharply.</p>
      </Box>
      <TxStatusDialog state={swapTx.txState} />
      <Button intent="primary" className="primary-action" disabled={submitDisabled} fluidWidth onClick={handleSwap} domAttributes={{ type: "button" }}>{actionCopy}</Button>
    </Stack>
  );
}
