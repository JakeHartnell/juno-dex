import { useMemo, useState } from "react";
import type { RegistryPool } from "../../config/registry";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { applySlippageToAssets, calculatePercentageFill, estimateWithdrawAssets } from "../../lib/liquidity/withdraw";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { assessPoolRisk } from "../../lib/risk";
import { formatBpsPercent } from "../../lib/swap/slippage";
import { buildWithdrawLiquidityExecuteInstruction, useWithdrawLiquidityTx } from "../../mutations/useWithdrawLiquidityTx";
import { estimateExecuteNetworkFee, type NetworkFeeEstimate } from "../../lib/cosmjs/fees";
import { usePoolReserves } from "../../queries/usePools";
import { getWalletBalanceAmount, resolveDenom, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { RiskAcknowledgement, RiskBadgeList, TokenAmountInput, TransactionReview } from "../common";
import { TxStatusDialog } from "../tx/TxStatusDialog";

const QUICK_FILL_PERCENTAGES = [25, 50, 75, 100] as const;
type WithdrawAssets = ReturnType<typeof estimateWithdrawAssets>;
type RemoveLiquidityReview = {
  lpAmount: string;
  expectedAssets: WithdrawAssets;
  minimumAssets: WithdrawAssets;
  slippageBps: number;
  reserveVersion: string;
  networkFeeEstimate?: NetworkFeeEstimate;
};

function isPositiveBaseAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

export function RemoveLiquidityForm({ pool }: { pool: RegistryPool }) {
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const [amount, setAmount] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [review, setReview] = useState<RemoveLiquidityReview>();
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string>();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);
  const reserves = usePoolReserves(pool);
  const { slippageBps } = useSlippageSettings();
  const lp = resolveDenom(pool.lpToken, [pool]);
  const lpBalance = getWalletBalanceAmount(balances.data, pool.lpToken);
  const parsedAmount = parseTokenAmount(amount, lp.decimals);
  const lpBaseAmount = parsedAmount.baseAmount;
  const expectedAssets = useMemo(() => estimateWithdrawAssets(reserves.data, lpBaseAmount), [lpBaseAmount, reserves.data]);
  const minAssetsToReceive = useMemo(() => applySlippageToAssets(expectedAssets, slippageBps), [expectedAssets, slippageBps]);
  const risk = assessPoolRisk(pool, reserves.data);
  const poolType = getPoolTypeMetadata(pool.type);
  const signerOrClient = wallet.status === "connected" ? wallet.signer : undefined;
  const withdraw = useWithdrawLiquidityTx(signerOrClient, walletAddress);

  const hasAmount = parsedAmount.isValid && isPositiveBaseAmount(lpBaseAmount);
  const exceedsBalance = Boolean(lpBalance && parsedAmount.isValid && isBaseAmountGreaterThan(lpBaseAmount, lpBalance));
  const canWithdraw = wallet.status === "connected"
    && network.isJunoReady
    && !network.isWrongNetwork
    && hasAmount
    && !exceedsBalance
    && expectedAssets.length > 0
    && !reserves.isError
    && !risk.blocked
    && (!risk.requiresAcknowledgement || riskAcknowledged)
    && !isPreparingReview
    && !withdraw.isPending;

  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to withdraw"
    : wallet.status !== "connected"
      ? "Connect wallet to withdraw"
      : !hasAmount
        ? "Enter LP amount"
        : risk.blocked
          ? "Pool or asset blocked"
        : exceedsBalance
          ? "Insufficient LP balance"
          : reserves.isError
            ? "Reserve query unavailable"
            : reserves.isFetching && expectedAssets.length === 0
              ? "Estimating withdrawal…"
              : risk.requiresAcknowledgement && !riskAcknowledged
                ? "Acknowledge unverified pool"
              : withdraw.isPending
                ? "Withdrawing…"
                : isPreparingReview
                  ? "Refreshing reserves…"
                  : "Review withdrawal";

  const setBaseAmount = (baseAmount: string) => {
    const displayValue = formatAmount(baseAmount, lp.decimals, lp.decimals).replace(/,/g, "");
    setAmount(displayValue === "0" ? "" : displayValue);
  };

  const prepareWithdraw = async () => {
    if (!canWithdraw) return;
    setIsPreparingReview(true);
    setReviewError(undefined);
    const refreshed = await reserves.refetch();
    setIsPreparingReview(false);
    if (!refreshed.data) {
      setReviewError("Fresh pool reserves could not be loaded. Review remains unavailable.");
      return;
    }
    const freshExpectedAssets = estimateWithdrawAssets(refreshed.data, lpBaseAmount);
    if (freshExpectedAssets.length === 0) {
      setReviewError("Withdrawal outputs could not be estimated from refreshed reserves.");
      return;
    }
    const minimumAssets = applySlippageToAssets(freshExpectedAssets, slippageBps);
    const instruction = buildWithdrawLiquidityExecuteInstruction({ pool, lpAmount: lpBaseAmount, minAssetsToReceive: minimumAssets });
    const networkFeeEstimate = await estimateExecuteNetworkFee(signerOrClient, walletAddress, [instruction]).catch(() => undefined);
    setReview({
      lpAmount: lpBaseAmount,
      expectedAssets: freshExpectedAssets,
      minimumAssets,
      slippageBps,
      reserveVersion: `${refreshed.data.assets.map((asset) => asset.amount).join(":")}:${refreshed.data.total_share}`,
      networkFeeEstimate,
    });
  };

  const currentReserveVersion = reserves.data ? `${reserves.data.assets.map((asset) => asset.amount).join(":")}:${reserves.data.total_share}` : "";
  const reviewIsCurrent = Boolean(review && review.lpAmount === lpBaseAmount && review.slippageBps === slippageBps && review.reserveVersion === currentReserveVersion);

  const handleWithdraw = async () => {
    if (!review || !reviewIsCurrent || withdraw.isPending) return;
    try {
      await withdraw.mutateAsync({ pool, lpAmount: review.lpAmount, minAssetsToReceive: review.minimumAssets });
      setAmount("");
      setReview(undefined);
    } catch { /* Shared transaction runner owns failure state and recovery copy. */ }
  };

  return (
    <section className="action-card">
      <h3>Remove liquidity</h3>
      <p>{poolType.withdrawCopy}</p>
      <RiskBadgeList assessment={risk} max={4} />
      <TokenAmountInput
        label="LP amount"
        value={amount}
        decimals={lp.decimals}
        symbol={lp.symbol}
        balanceBaseAmount={lpBalance}
        onChange={(nextAmount) => setAmount(nextAmount)}
        onMax={setBaseAmount}
        disabled={wallet.status !== "connected" || network.isWrongNetwork || withdraw.isPending}
      />
      <div className="quick-fill-row" aria-label="LP withdrawal percentages">
        {QUICK_FILL_PERCENTAGES.map((percent) => (
          <button
            type="button"
            disabled={!lpBalance || wallet.status !== "connected" || network.isWrongNetwork || withdraw.isPending}
            key={percent}
            onClick={() => setBaseAmount(calculatePercentageFill(lpBalance, percent))}
          >
            {percent}%
          </button>
        ))}
      </div>
      <dl className="quote-details">
        <div><dt>Wallet LP balance</dt><dd className="quote-detail-value">{lpBalance ? `${formatAmount(lpBalance, lp.decimals)} ${lp.symbol}` : wallet.status === "connected" ? "Loading…" : "Connect wallet"}</dd></div>
        {pool.assets.map((asset, index) => {
          const expected = expectedAssets[index]?.amount;
          const minimum = minAssetsToReceive[index]?.amount;
          return (
            <div key={asset.id}>
              <dt>{asset.symbol} expected / minimum ({formatBpsPercent(slippageBps)})</dt>
              <dd className="quote-detail-value">
                {expected ? `${formatAmount(expected, asset.decimals)} / ${formatAmount(minimum, asset.decimals)} ${asset.symbol}` : "—"}
              </dd>
            </div>
          );
        })}
      </dl>
      <details className="identifier-disclosure"><summary>LP token identifier</summary><code>{pool.lpToken}</code></details>
      {!poolType.supportsWithdrawSimulation ? (
        <p className="price-impact-warning" role="status">{poolType.shortLabel} withdraw simulation is not implemented locally. The amounts above are proportional estimates from live reserves; verify final outputs in the wallet before signing.</p>
      ) : null}
      {balances.isError ? <p className="error-text">Your LP balance could not be loaded. Try again before removing liquidity.</p> : null}
      {reserves.isError ? <p className="error-text">Current pool balances could not be loaded. Output estimates are unavailable; try again.</p> : null}
      {network.isWrongNetwork ? <p className="error-text">Switch to Juno to withdraw liquidity. Transactions are blocked off-network.</p> : null}
      {reviewError ? <p className="error-text" role="alert">{reviewError}</p> : null}
      <RiskAcknowledgement assessment={risk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="liquidity withdrawal" />
      {wallet.status !== "connected" ? <p className="empty-state">Connect a wallet to see your position and remove liquidity.</p> : null}
      <button type="button" disabled={!canWithdraw} onClick={prepareWithdraw}>{actionCopy}</button>
      <TxStatusDialog state={withdraw.txState} />
      <TransactionReview
        open={Boolean(review)}
        title="Review liquidity withdrawal"
        description="LP tokens sent are fixed. Underlying outputs are reserve-based estimates; each displayed minimum is enforced on-chain."
        account={walletAddress}
        chainId={network.connectedChainId ?? network.expectedChainId}
        networkFeeEstimate={review?.networkFeeEstimate}
        rows={review ? [
          { label: "LP tokens sent · fixed", value: `${formatAmount(review.lpAmount, lp.decimals)} ${lp.symbol}` },
          ...pool.assets.flatMap((asset, index) => [
            { label: `${asset.symbol} receive · estimated`, value: `${formatAmount(review.expectedAssets[index]?.amount ?? "0", asset.decimals)} ${asset.symbol}` },
            { label: `${asset.symbol} minimum · enforced`, value: `${formatAmount(review.minimumAssets[index]?.amount ?? "0", asset.decimals)} ${asset.symbol}` },
          ]),
          { label: "Slippage tolerance · enforced", value: formatBpsPercent(review.slippageBps) },
          { label: "Price impact", value: poolType.supportsWithdrawSimulation ? "Included in contract simulation" : "Unavailable; proportional reserve estimate only", tone: poolType.supportsWithdrawSimulation ? "default" as const : "warning" as const },
          { label: "Pool status", value: `${pool.status}${pool.verified === true ? ", verified" : ", unverified"}` },
        ] : []}
        disclosures={[
          { label: "Pair contract", value: pool.pair },
          { label: "LP token", value: pool.lpToken },
          ...pool.assets.map((asset) => ({ label: `${asset.symbol} identifier`, value: asset.id })),
        ]}
        warning={!reviewIsCurrent && review ? "LP amount, slippage, or reserves changed. Close this review and prepare a new one." : !poolType.supportsWithdrawSimulation ? "Output impact is unavailable for this pool type. Verify the enforced minimums carefully before signing." : undefined}
        confirmDisabled={!reviewIsCurrent}
        pending={withdraw.isPending}
        onClose={() => setReview(undefined)}
        onConfirm={() => void handleWithdraw()}
      />
    </section>
  );
}
