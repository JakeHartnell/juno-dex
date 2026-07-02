import { useMemo, useState } from "react";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { RegistryPool } from "../../config/registry";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { applySlippageToAssets, calculatePercentageFill, estimateWithdrawAssets } from "../../lib/liquidity/withdraw";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { assessPoolRisk } from "../../lib/risk";
import { formatBpsPercent } from "../../lib/swap/slippage";
import { useWithdrawLiquidityTx } from "../../mutations/useWithdrawLiquidityTx";
import { usePoolReserves } from "../../queries/usePools";
import { getWalletBalanceAmount, resolveDenom, useWalletBalances } from "../../queries/useWalletBalances";
import { useSlippageSettings } from "../../settings/SlippageSettingsContext";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { RiskAcknowledgement, RiskBadgeList, TokenAmountInput, useToast } from "../common";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;
const QUICK_FILL_PERCENTAGES = [25, 50, 75, 100] as const;

function isPositiveBaseAmount(amount: string) {
  return /^\d+$/.test(amount) && BigInt(amount) > 0n;
}

function txHashFromResult(result: unknown): string | undefined {
  if (result && typeof result === "object" && "transactionHash" in result) {
    const hash = (result as { transactionHash?: unknown }).transactionHash;
    return typeof hash === "string" ? hash : undefined;
  }
  return undefined;
}

export function RemoveLiquidityForm({ pool }: { pool: RegistryPool }) {
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
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
  const signerOrClient = wallet.status === "connected"
    ? (wallet.getSigningCosmWasmClient as SigningClientGetter | undefined) ?? (wallet.signer as OfflineSigner | undefined)
    : undefined;
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
    && (!risk.requiresAcknowledgement || riskAcknowledged)
    && !withdraw.isPending;

  const actionCopy = network.isWrongNetwork
    ? "Switch to Juno to withdraw"
    : wallet.status !== "connected"
      ? "Connect wallet to withdraw"
      : !hasAmount
        ? "Enter LP amount"
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
                : "Withdraw liquidity";

  const setBaseAmount = (baseAmount: string) => {
    const displayValue = formatAmount(baseAmount, lp.decimals, lp.decimals).replace(/,/g, "");
    setAmount(displayValue === "0" ? "" : displayValue);
  };

  const handleWithdraw = async () => {
    if (!canWithdraw) return;
    const pendingId = toast.pending({ title: "Withdrawing liquidity", message: `Broadcasting ${formatAmount(lpBaseAmount, lp.decimals)} ${lp.symbol}` });
    try {
      const result = await withdraw.mutateAsync({ pool, lpAmount: lpBaseAmount, minAssetsToReceive });
      toast.dismiss(pendingId);
      toast.success({ title: "Liquidity withdrawn", message: "Balances and reserves are refreshing.", txHash: txHashFromResult(result) });
      setAmount("");
    } catch (error) {
      toast.dismiss(pendingId);
      toast.error({ title: "Withdraw failed", message: error instanceof Error ? error.message : String(error) });
    }
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
      <code>{pool.lpToken}</code>
      <dl className="quote-details">
        <div><dt>LP denom</dt><dd className="quote-detail-value"><code>{pool.lpToken}</code></dd></div>
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
      {!poolType.supportsWithdrawSimulation ? (
        <p className="price-impact-warning" role="status">{poolType.shortLabel} withdraw simulation is not implemented locally. The amounts above are proportional estimates from live reserves; verify final outputs in the wallet before signing.</p>
      ) : null}
      {balances.isError ? <p className="error-text">Wallet balance query failed: {balances.error instanceof Error ? balances.error.message : String(balances.error)}</p> : null}
      {reserves.isError ? <p className="error-text">Pool reserve query failed: {reserves.error instanceof Error ? reserves.error.message : String(reserves.error)}</p> : null}
      {network.isWrongNetwork ? <p className="error-text">Switch to Juno to withdraw liquidity. Transactions are blocked off-network.</p> : null}
      <RiskAcknowledgement assessment={risk} checked={riskAcknowledged} onChange={setRiskAcknowledged} action="liquidity withdrawal" />
      {wallet.status !== "connected" ? <p className="empty-state">Connect a wallet to load your LP balance and broadcast withdrawal.</p> : null}
      <button type="button" disabled={!canWithdraw} onClick={handleWithdraw}>{actionCopy}</button>
    </section>
  );
}
