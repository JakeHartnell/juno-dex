import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import { dexRegistry, type RegistryAsset, type RegistryPool } from "../../config/registry";
import type { SwapQuoteMode } from "../../lib/astroport/queries";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { assessRouteRisk } from "../../lib/risk";
import { HIGH_SLIPPAGE_BPS, calculateMinimumReceived, formatBpsPercent, getPriceImpact, slippageBpsToMaxSpread } from "../../lib/swap/slippage";
import { buildSwapExecuteInstruction, useSwapTx } from "../../mutations/useSwapTx";
import { estimateExecuteNetworkFee, type NetworkFeeEstimate } from "../../lib/cosmjs/fees";
import { type RouteQuote, useSwapQuote } from "../../queries/useSwapQuote";
import { useRouteReserves } from "../../queries/usePools";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { RiskAcknowledgement, RiskBadgeList, TokenAmountInput, TransactionReview } from "../common";
import { SettingsPanel } from "../settings/SettingsPanel";
import { QuoteCard } from "./QuoteCard";
import { TokenSelect } from "./TokenSelect";
import { TxStatusDialog } from "../tx/TxStatusDialog";

type SwapFormProps = {
  pool: RegistryPool;
  pools?: RegistryPool[];
  onMarketPoolChange?: (pool: RegistryPool) => void;
};

type SwapReviewSnapshot = {
  route: RouteQuote["route"];
  source: RouteQuote["source"];
  offerAmount: string;
  returnAmount: string;
  commissionAmount: string;
  minimumReceive: string;
  slippageBps: number;
  updatedAt: number;
  mode: SwapQuoteMode;
  networkFeeEstimate?: NetworkFeeEstimate;
};

function isPositiveBaseAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

const JUNO_GAS_RESERVE = 250_000n;

function spendableBalance(asset: RegistryAsset, balance: string | undefined) {
  if (!balance || !/^\d+$/.test(balance)) return "0";
  const amount = BigInt(balance);
  if (asset.id !== "ujuno") return amount.toString();
  return amount > JUNO_GAS_RESERVE ? (amount - JUNO_GAS_RESERVE).toString() : "0";
}

function inputAmountFromBase(baseAmount: string, decimals: number) {
  return formatAmount(baseAmount, decimals, decimals).replace(/,/g, "");
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
        verified: existing?.verified === true || asset.verified === true,
        poolCount: (existing?.poolCount ?? 0) + 1,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function SwapForm({ pool, pools, onMarketPoolChange }: SwapFormProps) {
  const allPools = useMemo(() => pools && pools.length > 0 ? pools : [pool], [pool, pools]);
  const selectableAssets = useMemo(() => buildSelectableAssets(allPools), [allPools]);
  const { wallet, connect } = useWallet();
  const { network, switchToJuno } = useNetworkGuard();
  const [offerId, setOfferId] = useState(pool.assets[0].id);
  const [askId, setAskId] = useState(pool.assets[1].id);
  const [amount, setAmount] = useState("");
  const [askAmount, setAskAmount] = useState("");
  const [quoteMode, setQuoteMode] = useState<SwapQuoteMode>("exact-in");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [priceImpactAcknowledged, setPriceImpactAcknowledged] = useState(false);
  const [slippageAcknowledged, setSlippageAcknowledged] = useState(false);
  const [unavailableImpactAcknowledged, setUnavailableImpactAcknowledged] = useState(false);
  const [reviewSnapshot, setReviewSnapshot] = useState<SwapReviewSnapshot>();
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const { slippageBps, formattedSlippagePercent, maxSpread, setSlippageBps } = useSlippageSettings();
  const offerAsset = selectableAssets.find((asset) => asset.id === offerId) ?? pool.assets[0];
  const askAsset = selectableAssets.find((asset) => asset.id === askId && asset.id !== offerAsset.id) ?? selectableAssets.find((asset) => asset.id !== offerAsset.id) ?? pool.assets[1];
  const parsedOfferInput = parseTokenAmount(amount, offerAsset.decimals);
  const parsedAskInput = parseTokenAmount(askAmount, askAsset.decimals);
  const quoteInputBaseAmount = quoteMode === "exact-out" ? parsedAskInput.baseAmount : parsedOfferInput.baseAmount;
  const activeParsedAmount = quoteMode === "exact-out" ? parsedAskInput : parsedOfferInput;
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, allPools);
  const offerBalance = getWalletBalanceAmount(balances.data, offerAsset.id);
  const askBalance = getWalletBalanceAmount(balances.data, askAsset.id);
  const balancesReady = wallet.status !== "connected" || (balances.data !== undefined && !balances.isFetching);
  const quote = useSwapQuote(allPools, offerAsset, askAsset, quoteInputBaseAmount, quoteMode);
  const signerOrClient = wallet.status === "connected" ? wallet.signer : undefined;
  const swapTx = useSwapTx(signerOrClient, walletAddress);
  const requiredOfferBaseAmount = quoteMode === "exact-out" && quote.data ? quote.data.offer_amount : parsedOfferInput.baseAmount;
  const hasAmount = activeParsedAmount.isValid && isPositiveBaseAmount(quoteInputBaseAmount);
  const sameToken = offerAsset.id === askAsset.id;
  const exceedsBalance = Boolean(balancesReady && isPositiveBaseAmount(requiredOfferBaseAmount) && isBaseAmountGreaterThan(requiredOfferBaseAmount, offerBalance ?? "0"));
  const quoteReady = quote.isSuccess && Boolean(quote.data) && !quote.isFetching && !quote.isError && !quote.isDebouncing && !quote.isExpired;
  const priceImpact = quote.data && quote.data.source === "pair" ? getPriceImpact({ spreadAmount: quote.data.spread_amount, returnAmount: quote.data.return_amount }) : null;
  const hasHighPriceImpact = priceImpact?.severity === "high";
  const hasExtremePriceImpact = priceImpact?.severity === "extreme";
  const hasUnavailablePriceImpact = quote.data?.source === "router";
  const hasHighSlippage = slippageBps > HIGH_SLIPPAGE_BPS;
  const selectedRoute = quote.data?.route;
  const routeReserves = useRouteReserves(selectedRoute);
  useEffect(() => {
    onMarketPoolChange?.(selectedRoute?.hops[0]?.pool ?? pool);
  }, [onMarketPoolChange, pool, selectedRoute]);
  const routeRisk = assessRouteRisk(selectedRoute, routeReserves);
  const minimumReceive = quote.data ? calculateMinimumReceived(quote.data.return_amount, slippageBps) : "0";
  useEffect(() => {
    setRiskAcknowledged(false);
    setPriceImpactAcknowledged(false);
    setUnavailableImpactAcknowledged(false);
    setReviewSnapshot(undefined);
  }, [quoteInputBaseAmount, quoteMode, offerAsset.id, askAsset.id, selectedRoute?.id]);
  useEffect(() => {
    setSlippageAcknowledged(false);
    setReviewSnapshot(undefined);
  }, [slippageBps]);

  const validationError = !activeParsedAmount.isValid
    ? activeParsedAmount.error
    : sameToken
      ? "Choose two different tokens"
      : !hasAmount
        ? "Enter amount"
        : !balancesReady
          ? "Loading wallet balance…"
        : quote.isDebouncing
          ? "Updating quote…"
          : exceedsBalance
            ? `Insufficient ${offerAsset.symbol} balance`
            : quote.isError
              ? "Route preview unavailable"
              : quote.isExpired
                ? "Quote expired — refresh required"
              : quote.isFetching || (hasAmount && !quoteReady)
                ? "Refreshing route…"
                : !selectedRoute
                  ? "No route found"
                  : routeRisk.blocked
                    ? "Blocked asset or pool"
                  : hasExtremePriceImpact
                    ? `Price impact too high (${formatBpsPercent(priceImpact.bps)})`
                  : hasHighPriceImpact && !priceImpactAcknowledged
                    ? "Acknowledge high price impact"
                  : hasUnavailablePriceImpact && !unavailableImpactAcknowledged
                    ? "Acknowledge unavailable price impact"
                  : hasHighSlippage && !slippageAcknowledged
                    ? "Acknowledge high slippage"
                  : routeRisk.requiresAcknowledgement && !riskAcknowledged
                    ? "Acknowledge unverified route"
                    : undefined;
  const submitDisabled = wallet.status === "connected" && (!network.isJunoReady
    || network.isWrongNetwork
    || Boolean(validationError)
    || swapTx.isPending
    || isPreparingReview);
  const primaryActionDisabled = wallet.status === "connecting"
    || network.isRecovering
    || (wallet.status === "connected" && network.isJunoReady && !network.isWrongNetwork && (Boolean(validationError) || swapTx.isPending || isPreparingReview));
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to swap"
    : wallet.status === "connected" && !network.isJunoReady
      ? "Juno network required"
      : wallet.status !== "connected"
        ? "Connect wallet to swap"
        : swapTx.isPending
          ? "Swapping…"
          : isPreparingReview
            ? "Refreshing quote…"
            : validationError ?? "Review swap";

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

  const handleReview = async () => {
    if (submitDisabled || !selectedRoute || !quote.data) return;
    setIsPreparingReview(true);
    const refreshed = await quote.refreshQuote();
    setIsPreparingReview(false);
    if (!refreshed.data || refreshed.isError) return;
    const refreshedMinimum = calculateMinimumReceived(refreshed.data.return_amount, slippageBps);
    const instruction = buildSwapExecuteInstruction({
      pool: refreshed.data.route.hops[0]?.pool,
      route: refreshed.data.route,
      offerAsset,
      askAsset,
      amount: refreshed.data.offer_amount,
      maxSpread: slippageBpsToMaxSpread(slippageBps),
      minimumReceive: refreshedMinimum,
      source: refreshed.data.source,
    });
    const networkFeeEstimate = await estimateExecuteNetworkFee(signerOrClient, walletAddress, [instruction]).catch(() => undefined);
    setReviewSnapshot({
      route: refreshed.data.route,
      source: refreshed.data.source,
      offerAmount: refreshed.data.offer_amount,
      returnAmount: refreshed.data.return_amount,
      commissionAmount: refreshed.data.commission_amount,
      minimumReceive: refreshedMinimum,
      slippageBps,
      updatedAt: refreshed.dataUpdatedAt,
      mode: quoteMode,
      networkFeeEstimate,
    });
  };

  const handlePrimaryAction = async () => {
    if (wallet.status !== "connected") {
      await connect();
      return;
    }
    if (network.isWrongNetwork || !network.isJunoReady) {
      await switchToJuno();
      return;
    }
    await handleReview();
  };

  const reviewIsCurrent = Boolean(reviewSnapshot
    && quote.data
    && !quote.isExpired
    && quote.data.route.id === reviewSnapshot.route.id
    && quote.data.offer_amount === reviewSnapshot.offerAmount
    && quote.data.return_amount === reviewSnapshot.returnAmount
    && quote.quoteUpdatedAt === reviewSnapshot.updatedAt
    && slippageBps === reviewSnapshot.slippageBps);

  const handleSwap = () => {
    if (!reviewSnapshot || !reviewIsCurrent || swapTx.isPending) return;
    swapTx.mutate({
      pool: reviewSnapshot.route.hops[0]?.pool,
      route: reviewSnapshot.route,
      offerAsset,
      askAsset,
      amount: reviewSnapshot.offerAmount,
      maxSpread: slippageBpsToMaxSpread(reviewSnapshot.slippageBps),
      minimumReceive: reviewSnapshot.minimumReceive,
      source: reviewSnapshot.source,
    });
    setReviewSnapshot(undefined);
  };

  return (
    <Stack className="swap-card" direction="vertical" space="6">
      <Stack className="swap-card-header" direction="horizontal" align="center" justify="space-between" flexWrap="wrap">
        <Box>
          <Text as="h2" variant="heading">Swap</Text>
          <Text as="p" className="swap-mode-copy">
            <strong>{quoteMode === "exact-out" ? "Target buy" : "Sell exact"}</strong>
            {quoteMode === "exact-out" ? " · enter the amount you want to receive" : " · enter the amount you want to send"}
          </Text>
        </Box>
        <div className="swap-settings">
          <button
            className="icon-button slippage-icon-button"
            type="button"
            aria-label={`Slippage ${formattedSlippagePercent}%`}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
            title={`Swap max_spread ${maxSpread}`}
          >
            <span className="slippage-icon" aria-hidden="true" />
          </button>
          {settingsOpen ? <SettingsPanel onClose={closeSettings} /> : null}
        </div>
      </Stack>
      <div className="swap-amount-stack">
        <Stack className="asset-amount-card" direction="vertical" space="4">
          <Stack className="form-grid" direction="horizontal" align="flex-end">
            <TokenAmountInput
              label="You send"
              value={quoteMode === "exact-out" && quote.data ? formatAmount(quote.data.offer_amount, offerAsset.decimals) : amount}
              decimals={offerAsset.decimals}
              symbol={offerAsset.symbol}
              balanceBaseAmount={offerBalance}
              onChange={updateOfferAmount}
              onMax={() => updateOfferAmount(inputAmountFromBase(spendableBalance(offerAsset, offerBalance), offerAsset.decimals))}
              onHalf={() => updateOfferAmount(inputAmountFromBase((BigInt(spendableBalance(offerAsset, offerBalance)) / 2n).toString(), offerAsset.decimals))}
              fiatHint={quoteMode === "exact-out" && quote.data ? <span>Estimated input for target</span> : offerAsset.id === "ujuno" ? <span>MAX reserves 0.25 JUNO for network fees</span> : undefined}
              showQuickActions
              showTokenIdentity={false}
            />
            <TokenSelect assets={selectableAssets} value={offerId} onChange={handleOfferChange} label="From asset" balances={balances.data} showIdentifier={false} hideLabel />
          </Stack>
        </Stack>
        <button type="button" className="swap-direction" onClick={handleFlip} title="Flip swap direction" aria-label="Flip swap direction">
          <svg className="swap-direction-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m3 16 4 4 4-4" />
            <path d="M7 20V4" />
            <path d="m21 8-4-4-4 4" />
            <path d="M17 4v16" />
          </svg>
        </button>
        <Stack className="asset-amount-card receive-card" direction="vertical" space="4">
          <Stack className="form-grid" direction="horizontal" align="flex-end">
            <TokenAmountInput
              label={quoteMode === "exact-out" ? "Target receive" : "You receive"}
              value={quoteMode === "exact-out" ? askAmount : quote.data ? formatAmount(quote.data.return_amount, askAsset.decimals) : ""}
              decimals={askAsset.decimals}
              symbol={askAsset.symbol}
              balanceBaseAmount={askBalance}
              onChange={updateAskAmount}
              showQuickActions={false}
              showTokenIdentity={false}
            />
            <TokenSelect assets={selectableAssets.filter((asset) => asset.id !== offerAsset.id)} value={askAsset.id} onChange={(next) => { setAskId(next); setQuoteMode("exact-in"); }} label="To asset" balances={balances.data} showIdentifier={false} hideLabel />
          </Stack>
        </Stack>
      </div>
      {quoteMode === "exact-out" ? <p className="price-impact-warning" role="status">Target output is an estimate, not a guarantee. Execution uses the estimated input shown above and enforces the minimum received below.</p> : null}
      <QuoteCard quote={quote.data} askAsset={askAsset} offerAsset={offerAsset} isLoading={quote.isFetching || quote.isDebouncing} error={quote.error} slippageBps={slippageBps} updatedAt={quote.quoteUpdatedAt} minimumReceive={minimumReceive} expiresInMs={quote.expiresInMs} isExpired={quote.isExpired} onSlippageBps={setSlippageBps} />
      {priceImpact?.severity === "warning" ? (
        <div className="price-impact-warning" role="status">Price impact is elevated at {formatBpsPercent(priceImpact.bps)}. Review size and pool liquidity before swapping.</div>
      ) : null}
      {hasHighPriceImpact ? (
        <label className="price-impact-warning price-impact-danger risk-acknowledgement">
          <input type="checkbox" checked={priceImpactAcknowledged} onChange={(event) => setPriceImpactAcknowledged(event.target.checked)} />
          <span>I understand this quote has high price impact ({formatBpsPercent(priceImpact.bps)}) and may execute at a materially worse price.</span>
        </label>
      ) : null}
      {hasExtremePriceImpact ? <div className="price-impact-warning price-impact-danger" role="alert">This swap is blocked because its {formatBpsPercent(priceImpact.bps)} price impact exceeds the 15% safety limit. Reduce the amount or choose another route.</div> : null}
      {hasUnavailablePriceImpact ? (
        <label className="price-impact-warning risk-acknowledgement">
          <input type="checkbox" checked={unavailableImpactAcknowledged} onChange={(event) => setUnavailableImpactAcknowledged(event.target.checked)} />
          <span>I understand price impact is unavailable for this multi-hop route and will verify the minimum received before signing.</span>
        </label>
      ) : null}
      {hasHighSlippage ? (
        <label className="price-impact-warning price-impact-danger risk-acknowledgement">
          <input type="checkbox" checked={slippageAcknowledged} onChange={(event) => setSlippageAcknowledged(event.target.checked)} />
          <span>I understand the {formatBpsPercent(slippageBps)} slippage tolerance permits a materially worse execution price.</span>
        </label>
      ) : null}
      {selectedRoute ? <RiskBadgeList assessment={routeRisk} /> : null}
      <RiskAcknowledgement assessment={routeRisk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="swap route" />
      {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
      {validationError && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validationError}</Text> : null}
      <Button intent="primary" className="primary-action" disabled={primaryActionDisabled} fluidWidth onClick={handlePrimaryAction} domAttributes={{ type: "button" }}>{actionCopy}</Button>
      <TxStatusDialog state={swapTx.txState} />
      <TransactionReview
        open={Boolean(reviewSnapshot)}
        title="Review swap"
        description={reviewSnapshot?.mode === "exact-out" ? "Target output is estimated. The displayed input is fixed for this transaction and minimum received is enforced on-chain." : "The send amount is fixed. Estimated receive may move, but the displayed minimum received is enforced on-chain."}
        account={walletAddress}
        chainId={network.connectedChainId ?? network.expectedChainId}
        networkFeeEstimate={reviewSnapshot?.networkFeeEstimate}
        rows={reviewSnapshot ? [
          { label: "You send · fixed", value: `${formatAmount(reviewSnapshot.offerAmount, offerAsset.decimals)} ${offerAsset.symbol}` },
          { label: "Receive · estimated", value: `${formatAmount(reviewSnapshot.returnAmount, askAsset.decimals)} ${askAsset.symbol}` },
          { label: "Minimum received · enforced", value: `${formatAmount(reviewSnapshot.minimumReceive, askAsset.decimals)} ${askAsset.symbol}` },
          { label: "Max slippage · enforced", value: formatBpsPercent(reviewSnapshot.slippageBps), tone: reviewSnapshot.slippageBps > HIGH_SLIPPAGE_BPS ? "warning" as const : "default" as const },
          { label: "Price impact · estimated", value: reviewSnapshot.source === "pair" && priceImpact ? formatBpsPercent(priceImpact.bps) : "Unavailable for multi-hop route", tone: reviewSnapshot.source === "router" ? "warning" as const : priceImpact?.severity === "high" || priceImpact?.severity === "extreme" ? "danger" as const : "default" as const },
          { label: "Pool commission · estimated", value: reviewSnapshot.source === "pair" ? `${formatAmount(reviewSnapshot.commissionAmount, askAsset.decimals)} ${askAsset.symbol}` : "Unavailable for multi-hop route", tone: reviewSnapshot.source === "router" ? "warning" as const : "default" as const },
          { label: "Route", value: `${reviewSnapshot.route.hops.length} hop${reviewSnapshot.route.hops.length === 1 ? "" : "s"}` },
          { label: "Assets", value: `${offerAsset.symbol} (${offerAsset.verified === true ? "verified" : "unverified"}, ${offerAsset.kind}) → ${askAsset.symbol} (${askAsset.verified === true ? "verified" : "unverified"}, ${askAsset.kind})` },
          { label: "Pool status", value: reviewSnapshot.route.hops.map((hop) => `${hop.pool.label}: ${hop.pool.status}${hop.pool.verified === true ? ", verified" : ", unverified"}`).join(" · ") },
        ] : []}
        disclosures={reviewSnapshot ? [
          { label: "Offer denom / contract", value: offerAsset.id },
          { label: "Receive denom / contract", value: askAsset.id },
          ...reviewSnapshot.route.hops.map((hop, index) => ({ label: `Pair contract ${index + 1}`, value: hop.pool.pair })),
          ...(reviewSnapshot.source === "router" ? [{ label: "Router contract", value: dexRegistry.router }] : []),
        ] : []}
        warning={!reviewIsCurrent && reviewSnapshot ? "The amount, route, slippage, or quote version changed. Close this review and refresh it before signing." : undefined}
        confirmDisabled={!reviewIsCurrent}
        pending={swapTx.isPending}
        onClose={() => setReviewSnapshot(undefined)}
        onConfirm={handleSwap}
      />
    </Stack>
  );
}
