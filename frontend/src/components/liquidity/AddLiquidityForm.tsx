import { useMemo, useState } from "react";
import { Box, Button, Stack, Text } from "@interchain-ui/react";
import type { RegistryPool } from "../../config/registry";
import { displayBaseAmount, calculateInitialLiquidityQuote, calculateProvideLiquidityQuote, formatLpShareBps, ratioAmount } from "../../lib/liquidity/provide";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount, toBaseAmount } from "../../lib/format/amounts";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { assessPoolRisk } from "../../lib/risk";
import { slippageBpsToMaxSpread } from "../../lib/swap/slippage";
import { buildProvideLiquidityExecuteInstruction, useProvideLiquidityTx } from "../../mutations/useProvideLiquidityTx";
import { estimateExecuteNetworkFee, type NetworkFeeEstimate } from "../../lib/cosmjs/fees";
import { usePoolReserves } from "../../queries/usePools";
import { getWalletBalanceAmount, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { RiskAcknowledgement, RiskBadgeList, TokenAmountInput, TransactionReview } from "../common";
import { TxStatusDialog } from "../tx/TxStatusDialog";

type AddLiquidityReview = {
  amounts: [string, string];
  minLpToReceive?: string;
  expectedLpAmount?: string;
  poolShare?: string;
  slippageBps: number;
  reserveVersion: string;
  isFirstProvider: boolean;
  networkFeeEstimate?: NetworkFeeEstimate;
};

function hasPositiveBaseAmount(amount: string): boolean {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

function applySlippageFloor(amount: string, slippageBps: number): string {
  if (!/^\d+$/.test(amount)) return "0";
  return ((BigInt(amount) * BigInt(10_000 - slippageBps)) / 10_000n).toString();
}

export function AddLiquidityForm({ pool }: { pool: RegistryPool }) {
  const { wallet, connect } = useWallet();
  const { network, switchToJuno } = useNetworkGuard();
  const { slippageBps, formattedSlippagePercent, maxSpread } = useSlippageSettings();
  const [amounts, setAmounts] = useState<[string, string]>(["", ""]);
  const [lastEditedIndex, setLastEditedIndex] = useState<0 | 1>(0);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [seedAcknowledgement, setSeedAcknowledgement] = useState("");
  const [review, setReview] = useState<AddLiquidityReview>();
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string>();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);
  const reserves = usePoolReserves(pool);
  const signerOrClient = wallet.status === "connected" ? wallet.signer : undefined;
  const provideTx = useProvideLiquidityTx(signerOrClient, walletAddress);
  const poolType = getPoolTypeMetadata(pool.type);

  const reserveAmounts = useMemo<[string, string] | undefined>(() => {
    const poolAssets = reserves.data?.assets;
    if (!poolAssets || poolAssets.length < 2) return undefined;
    return [poolAssets[0]?.amount ?? "0", poolAssets[1]?.amount ?? "0"];
  }, [reserves.data?.assets]);

  const baseAmounts = useMemo<[string, string]>(() => [
    toBaseAmount(amounts[0], pool.assets[0].decimals),
    toBaseAmount(amounts[1], pool.assets[1].decimals),
  ], [amounts, pool.assets]);

  const initialQuote = calculateInitialLiquidityQuote({
    depositAmounts: baseAmounts,
    decimals: [pool.assets[0].decimals, pool.assets[1].decimals],
    reserves: reserveAmounts,
    totalShare: reserves.data?.total_share,
  });
  const isFirstProvider = poolType.supportsProvideLiquidity && initialQuote.isFirstProvider;
  const quote = reserveAmounts && !isFirstProvider
    ? calculateProvideLiquidityQuote({ depositAmounts: baseAmounts, reserves: reserveAmounts, totalShare: reserves.data?.total_share ?? "0" })
    : null;
  const risk = assessPoolRisk(pool, reserves.data);
  const minLpToReceive = quote ? applySlippageFloor(quote.expectedLpAmount, slippageBps) : undefined;

  const updateAmount = (index: 0 | 1, nextAmount: string) => {
    setLastEditedIndex(index);
    const nextBase = toBaseAmount(nextAmount, pool.assets[index].decimals);
    setAmounts((current) => {
      const updated: [string, string] = [...current] as [string, string];
      updated[index] = nextAmount;
      const otherIndex = index === 0 ? 1 : 0;
      if (reserveAmounts && !isFirstProvider && hasPositiveBaseAmount(nextBase)) {
        const otherBase = ratioAmount(nextBase, reserveAmounts[index], reserveAmounts[otherIndex]);
        updated[otherIndex] = otherBase === "0" ? "" : displayBaseAmount(otherBase, pool.assets[otherIndex].decimals);
      } else if (!hasPositiveBaseAmount(nextBase)) {
        updated[otherIndex] = "";
      }
      return updated;
    });
  };

  const validationError = useMemo(() => {
    const parsed0 = parseTokenAmount(amounts[0], pool.assets[0].decimals);
    const parsed1 = parseTokenAmount(amounts[1], pool.assets[1].decimals);
    if (risk.blocked) return "This pool or one of its assets is blocked";
    if (!poolType.supportsProvideLiquidity) return `${poolType.shortLabel} add liquidity is not supported in the UI yet`;
    if (pool.assets.some((asset) => asset.kind === "cw20")) return "CW20 add liquidity is unavailable until exact token allowances are implemented";
    if (!parsed0.isValid) return `${pool.assets[0].symbol}: ${parsed0.error}`;
    if (!parsed1.isValid) return `${pool.assets[1].symbol}: ${parsed1.error}`;
    if (!hasPositiveBaseAmount(baseAmounts[0]) || !hasPositiveBaseAmount(baseAmounts[1])) return "Enter both token amounts";
    const balance0 = getWalletBalanceAmount(balances.data, pool.assets[0].id);
    const balance1 = getWalletBalanceAmount(balances.data, pool.assets[1].id);
    if (balance0 && isBaseAmountGreaterThan(baseAmounts[0], balance0)) return `${pool.assets[0].symbol} amount exceeds wallet balance`;
    if (balance1 && isBaseAmountGreaterThan(baseAmounts[1], balance1)) return `${pool.assets[1].symbol} amount exceeds wallet balance`;
    if (!reserveAmounts) return "Pool reserves are still loading";
    if (isFirstProvider && seedAcknowledgement.trim() !== "SEED") return "Type SEED to acknowledge first-provider price setting";
    if (!isFirstProvider) {
      if (!quote) return "Pool share estimate unavailable";
      if (!quote.isProportional) return "Amounts must match the current pool ratio";
    }
    if (risk.requiresAcknowledgement && !riskAcknowledged) return "Acknowledge unverified pool";
    return undefined;
  }, [amounts, balances.data, baseAmounts, isFirstProvider, pool.assets, poolType.shortLabel, poolType.supportsProvideLiquidity, quote, reserveAmounts, risk.blocked, risk.requiresAcknowledgement, riskAcknowledged, seedAcknowledgement]);

  const submitDisabled = Boolean(validationError)
    || wallet.status !== "connected"
    || network.isWrongNetwork
    || provideTx.isPending
    || isPreparingReview;
  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to add liquidity"
    : wallet.status !== "connected"
      ? "Connect wallet to add liquidity"
      : validationError ?? (provideTx.isPending ? "Broadcasting…" : isPreparingReview ? "Refreshing reserves…" : isFirstProvider ? "Review initial liquidity" : "Review add liquidity");

  const onSubmit = async () => {
    if (wallet.status !== "connected") {
      await connect();
      return;
    }
    if (network.isWrongNetwork) {
      await switchToJuno();
      return;
    }
    if (submitDisabled) return;
    setIsPreparingReview(true);
    setReviewError(undefined);
    const refreshed = await reserves.refetch();
    setIsPreparingReview(false);
    const freshAssets = refreshed.data?.assets;
    if (!freshAssets || freshAssets.length < 2) {
      setReviewError("Fresh pool reserves could not be loaded. Review remains unavailable.");
      return;
    }
    const freshReserveAmounts: [string, string] = [freshAssets[0]?.amount ?? "0", freshAssets[1]?.amount ?? "0"];
    const freshInitial = calculateInitialLiquidityQuote({ depositAmounts: baseAmounts, decimals: [pool.assets[0].decimals, pool.assets[1].decimals], reserves: freshReserveAmounts, totalShare: refreshed.data?.total_share });
    const freshIsFirstProvider = poolType.supportsProvideLiquidity && freshInitial.isFirstProvider;
    if (freshIsFirstProvider !== isFirstProvider) {
      setReviewError("Pool liquidity changed while preparing review. Check the new pool state and review again.");
      return;
    }
    const freshQuote = freshIsFirstProvider ? null : calculateProvideLiquidityQuote({ depositAmounts: baseAmounts, reserves: freshReserveAmounts, totalShare: refreshed.data?.total_share ?? "0" });
    if (!freshIsFirstProvider && (!freshQuote || !freshQuote.isProportional)) {
      setReviewError("The refreshed reserve ratio no longer matches these deposit amounts. Adjust the amount and review again.");
      return;
    }
    const minLpToReceive = freshQuote ? applySlippageFloor(freshQuote.expectedLpAmount, slippageBps) : undefined;
    const instruction = buildProvideLiquidityExecuteInstruction({ pool, amounts: [...baseAmounts] as [string, string], slippageTolerance: slippageBpsToMaxSpread(slippageBps), minLpToReceive });
    const networkFeeEstimate = await estimateExecuteNetworkFee(signerOrClient, walletAddress, [instruction]).catch(() => undefined);
    setReview({
      amounts: [...baseAmounts] as [string, string],
      minLpToReceive,
      expectedLpAmount: freshQuote?.expectedLpAmount,
      poolShare: freshQuote ? formatLpShareBps(freshQuote.poolShareBps) : "Approximately 100% before locked minimum liquidity",
      slippageBps,
      reserveVersion: `${freshReserveAmounts.join(":")}:${refreshed.data?.total_share ?? "0"}`,
      isFirstProvider: freshIsFirstProvider,
      networkFeeEstimate,
    });
  };

  const currentReserveVersion = reserveAmounts ? `${reserveAmounts.join(":")}:${reserves.data?.total_share ?? "0"}` : "";
  const reviewIsCurrent = Boolean(review
    && review.amounts[0] === baseAmounts[0]
    && review.amounts[1] === baseAmounts[1]
    && review.slippageBps === slippageBps
    && review.reserveVersion === currentReserveVersion);

  const confirmAddLiquidity = () => {
    if (!review || !reviewIsCurrent || provideTx.isPending) return;
    provideTx.mutate({ pool, amounts: review.amounts, slippageTolerance: slippageBpsToMaxSpread(review.slippageBps), minLpToReceive: review.minLpToReceive });
    setReview(undefined);
  };

  return (
    <Stack as="section" className="action-card" direction="vertical" space="5">
      <Stack direction="horizontal" justify="space-between" align="center" flexWrap="wrap">
        <Box>
          <Text as="h3">{isFirstProvider ? "Seed initial liquidity" : "Add liquidity"}</Text>
          <Text as="p">{poolType.provideCopy}</Text>
          <RiskBadgeList assessment={risk} max={4} />
        </Box>
        <Button variant="outlined" intent="secondary" size="sm" className="slippage-pill" domAttributes={{ type: "button", title: `provide_liquidity slippage_tolerance ${maxSpread}` }}>Slippage {formattedSlippagePercent}%</Button>
      </Stack>

      {pool.assets.map((asset, index) => (
        <TokenAmountInput
          key={asset.id}
          label={isFirstProvider ? `${asset.symbol} initial amount` : index === lastEditedIndex ? `${asset.symbol} amount · driving ratio` : `${asset.symbol} amount · auto-balanced`}
          value={amounts[index]}
          decimals={asset.decimals}
          symbol={asset.symbol}
          balanceBaseAmount={getWalletBalanceAmount(balances.data, asset.id)}
          onChange={(nextAmount) => updateAmount(index as 0 | 1, nextAmount)}
          onMax={() => undefined}
          onHalf={() => undefined}
          disabled={provideTx.isPending || !poolType.supportsProvideLiquidity}
          fiatHint={<span>Reserve: {reserveAmounts ? `${formatAmount(reserveAmounts[index], asset.decimals)} ${asset.symbol}` : "loading…"}</span>}
        />
      ))}

      <Box className="quote-card">
        {isFirstProvider ? (
          <>
            <Text as="p"><strong>Initial price:</strong> {initialQuote.price0In1 && initialQuote.price1In0 ? `1 ${pool.assets[0].symbol} = ${initialQuote.price0In1} ${pool.assets[1].symbol} · 1 ${pool.assets[1].symbol} = ${initialQuote.price1In0} ${pool.assets[0].symbol}` : "Enter both amounts to preview the starting price"}</Text>
            <Text as="p"><strong>Expected LP tokens:</strong> Contract-calculated after broadcast</Text>
            <Text as="p"><strong>Pool share:</strong> First provider starts at ~100% before minimum-liquidity lock and later deposits</Text>
          </>
        ) : (
          <>
            <Text as="p"><strong>Expected LP tokens:</strong> {quote ? formatAmount(quote.expectedLpAmount, 6) : "—"}</Text>
            <Text as="p"><strong>Estimated pool share:</strong> {quote ? formatLpShareBps(quote.poolShareBps) : "—"}</Text>
            <Text as="p"><strong>Ratio impact:</strong> {quote ? `${formatLpShareBps(quote.imbalanceBps)} off pool ratio` : "—"}</Text>
            <Text as="p"><strong>Minimum LP after slippage:</strong> {minLpToReceive ? formatAmount(minLpToReceive, 6) : "—"}</Text>
          </>
        )}
      </Box>

      {isFirstProvider ? (
        <Box className="empty-state compact first-provider-warning">
          <strong>First-provider warning</strong>
          <ul>
            <li>Your two amounts set the pool's initial price; there is no existing reserve ratio to auto-balance against.</li>
            <li>This ratio is effectively irreversible once arbitrage and later liquidity arrive, and the pool may permanently lock minimum liquidity.</li>
            <li>Thin starting liquidity can cause extreme slippage and makes the pool easier to move; seed only with an intentional price.</li>
          </ul>
          <label className="field">Type <code>SEED</code> to confirm you understand the starting-price responsibility.
            <input value={seedAcknowledgement} onChange={(event) => setSeedAcknowledgement(event.target.value)} placeholder="SEED" disabled={provideTx.isPending} />
          </label>
        </Box>
      ) : null}

      <Box className="empty-state compact">
        <strong>{poolType.supportsProvideLiquidity ? isFirstProvider ? "Initial seeding requires both sides" : "Single-sided deposits unavailable" : `${poolType.shortLabel} deposits disabled`}</strong>
        <p>{poolType.supportsProvideLiquidity ? isFirstProvider ? "Because this pool is empty, enter both assets manually to define the starting price before broadcasting provide_liquidity." : "This pool currently exposes proportional provide liquidity only in the app. Enter either side and the other side will be calculated from current reserves." : poolType.provideCopy}</p>
      </Box>

      {network.isWrongNetwork ? <Text as="p" className="error-text">Transactions are blocked while your wallet is off Juno mainnet.</Text> : null}
      <RiskAcknowledgement assessment={risk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="liquidity action" />
      {validationError && wallet.status === "connected" && !network.isWrongNetwork ? <Text as="p" className="error-text">{validationError}</Text> : null}
      {reviewError ? <p className="error-text" role="alert">{reviewError}</p> : null}
      <Button intent="primary" className="primary-action" disabled={wallet.status === "connected" && submitDisabled} fluidWidth onClick={onSubmit} domAttributes={{ type: "button" }}>{actionCopy}</Button>
      <TxStatusDialog state={provideTx.txState} />
      <TransactionReview
        open={Boolean(review)}
        title={review?.isFirstProvider ? "Review initial liquidity" : "Review add liquidity"}
        description={review?.isFirstProvider ? "Both deposits are fixed and set the pool's initial price. LP output is contract-calculated and unavailable before signature." : "Both deposits are fixed. Expected LP output and pool share are estimates; minimum LP received is enforced."}
        account={walletAddress}
        chainId={network.connectedChainId ?? network.expectedChainId}
        networkFeeEstimate={review?.networkFeeEstimate}
        rows={review ? [
          { label: `${pool.assets[0].symbol} deposit · fixed`, value: `${formatAmount(review.amounts[0], pool.assets[0].decimals)} ${pool.assets[0].symbol}` },
          { label: `${pool.assets[1].symbol} deposit · fixed`, value: `${formatAmount(review.amounts[1], pool.assets[1].decimals)} ${pool.assets[1].symbol}` },
          { label: "LP output · estimated", value: review.expectedLpAmount ? formatAmount(review.expectedLpAmount, 6) : "Contract-calculated after signature", tone: review.expectedLpAmount ? "default" as const : "warning" as const },
          { label: "Minimum LP · enforced", value: review.minLpToReceive ? formatAmount(review.minLpToReceive, 6) : "Unavailable for initial liquidity", tone: review.minLpToReceive ? "default" as const : "warning" as const },
          { label: "Pool share · estimated", value: review.poolShare ?? "Unavailable" },
          { label: "Slippage tolerance · enforced", value: `${review.slippageBps / 100}%` },
          { label: "Pool status", value: `${pool.status}${pool.verified === true ? ", verified" : ", unverified"}` },
          { label: "Protocol commission", value: "No separate add-liquidity commission reported", tone: "warning" as const },
        ] : []}
        disclosures={[
          { label: "Pair contract", value: pool.pair },
          { label: "LP token", value: pool.lpToken },
          { label: `${pool.assets[0].symbol} identifier`, value: pool.assets[0].id },
          { label: `${pool.assets[1].symbol} identifier`, value: pool.assets[1].id },
        ]}
        warning={!reviewIsCurrent && review ? "Deposit amounts, slippage, or pool reserves changed. Close this review and prepare a new one." : undefined}
        confirmDisabled={!reviewIsCurrent}
        pending={provideTx.isPending}
        onClose={() => setReview(undefined)}
        onConfirm={confirmAddLiquidity}
      />
    </Stack>
  );
}
