import { useMemo, useState } from "react";
import type { RegistryPool } from "../../config/registry";
import type { Asset, AssetInfo, RewardInfo } from "../../lib/generated/Incentives.types";
import { formatAmount, isBaseAmountGreaterThan, parseTokenAmount } from "../../lib/format/amounts";
import { totalRewardRps } from "../../lib/incentives";
import type { PoolMetrics } from "../../lib/pools/poolList";
import { useIncentivesTx } from "../../mutations/useIncentivesTx";
import { useIncentivesPool } from "../../queries/useIncentives";
import { getWalletBalanceAmount, resolveDenom, useWalletBalances } from "../../queries/useWalletBalances";
import { useNetworkGuard, useWallet } from "../../wallet/WalletContext";
import { TokenAmountInput, useToast } from "../common";

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

export function IncentivesPanel({ pool, metrics }: { pool: RegistryPool; metrics?: PoolMetrics }) {
  const { wallet } = useWallet();
  const { network } = useNetworkGuard();
  const toast = useToast();
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);
  const incentives = useIncentivesPool(pool, walletAddress);
  const lp = resolveDenom(pool.lpToken, [pool]);
  const lpBalance = getWalletBalanceAmount(balances.data, pool.lpToken);
  const stakedBalance = incentives.data?.stakedAmount;
  const parsedStake = parseTokenAmount(stakeAmount, lp.decimals);
  const parsedUnstake = parseTokenAmount(unstakeAmount, lp.decimals);
  const stakeBaseAmount = parsedStake.baseAmount;
  const unstakeBaseAmount = parsedUnstake.baseAmount;
  const stakeExceedsBalance = Boolean(lpBalance && parsedStake.isValid && isBaseAmountGreaterThan(stakeBaseAmount, lpBalance));
  const unstakeExceedsBalance = Boolean(stakedBalance && parsedUnstake.isValid && isBaseAmountGreaterThan(unstakeBaseAmount, stakedBalance));
  const hasPendingRewards = (incentives.data?.pendingRewards ?? []).some((reward) => isPositiveBaseAmount(reward.amount));
  const signerOrClient = wallet.status === "connected" ? wallet.signer : undefined;
  const incentivesTx = useIncentivesTx(signerOrClient, walletAddress);
  const rewardRps = useMemo(() => totalRewardRps(incentives.data?.rewardInfo ?? []), [incentives.data?.rewardInfo]);

  const configured = incentives.data?.configured ?? false;
  const canUseWallet = wallet.status === "connected" && network.isJunoReady && !network.isWrongNetwork && configured && !incentivesTx.isPending;
  const canStake = canUseWallet && parsedStake.isValid && isPositiveBaseAmount(stakeBaseAmount) && !stakeExceedsBalance;
  const canUnstake = canUseWallet && parsedUnstake.isValid && isPositiveBaseAmount(unstakeBaseAmount) && !unstakeExceedsBalance;
  const canClaim = canUseWallet && hasPendingRewards;

  const submit = async (action: "stake" | "unstake" | "claim") => {
    const amount = action === "stake" ? stakeBaseAmount : action === "unstake" ? unstakeBaseAmount : undefined;
    const pendingId = toast.pending({ title: actionTitle(action), message: `${actionTitle(action)} for ${pool.label}` });
    try {
      const result = await incentivesTx.mutateAsync({ action, pool, amount });
      toast.dismiss(pendingId);
      toast.success({ title: `${actionTitle(action)} submitted`, message: "Incentive balances are refreshing.", txHash: txHashFromResult(result) });
      if (action === "stake") setStakeAmount("");
      if (action === "unstake") setUnstakeAmount("");
    } catch (error) {
      toast.dismiss(pendingId);
      toast.error({ title: `${actionTitle(action)} failed`, message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <section className="action-card incentives-panel" id="incentives" aria-label="LP incentives">
      <h3>Incentives</h3>
      <p>Stake LP shares in the configured incentives contract to accrue internal and external pool rewards. Rewards and APR appear when reward data is available.</p>

      {!configured ? (
        <p className="empty-state">No incentives contract is configured for this deployment. LP staking, reward APR, and claiming are hidden rather than estimated.</p>
      ) : (
        <>
          <dl className="quote-details">
            <div><dt>Incentives contract</dt><dd className="quote-detail-value"><code>{incentives.data?.contractAddress}</code></dd></div>
            <div><dt>Reward APR</dt><dd className="quote-detail-value">{typeof metrics?.incentivesApr === "number" ? `${formatPercent(metrics.incentivesApr)} (indexer)` : "Unavailable until USD pricing/indexer rewards are configured"}</dd></div>
            <div><dt>Wallet LP</dt><dd className="quote-detail-value">{lpBalance ? `${formatAmount(lpBalance, lp.decimals)} ${lp.symbol}` : wallet.status === "connected" ? "Loading…" : "Connect wallet"}</dd></div>
            <div><dt>Staked LP</dt><dd className="quote-detail-value">{stakedBalance ? `${formatAmount(stakedBalance, lp.decimals)} ${lp.symbol}` : wallet.status === "connected" ? "0 or unavailable" : "Connect wallet"}</dd></div>
            <div><dt>Pool reward rate</dt><dd className="quote-detail-value">{rewardRps ? `${rewardRps} reward units/sec` : "No active reward rate reported"}</dd></div>
          </dl>
          {incentives.data?.queryError ? <p className="pool-metrics-copy">Some incentive balances are temporarily unavailable. You can retry by reopening this panel.</p> : null}
          <RewardList rewards={incentives.data?.pendingRewards ?? []} title="Pending rewards" empty="No pending rewards reported for this wallet." />
          <RewardInfoList rewards={incentives.data?.rewardInfo ?? []} />

          <div className="liquidity-grid">
            <div>
              <TokenAmountInput label="Stake LP" value={stakeAmount} decimals={lp.decimals} symbol={lp.symbol} balanceBaseAmount={lpBalance} onChange={setStakeAmount} disabled={!canUseWallet} />
              {stakeExceedsBalance ? <p className="error-text">Stake amount exceeds wallet LP balance.</p> : null}
              <button type="button" disabled={!canStake} onClick={() => void submit("stake")}>{stakeButtonCopy(wallet.status, network.isWrongNetwork, parsedStake.isValid, stakeBaseAmount, stakeExceedsBalance, incentivesTx.isPending)}</button>
            </div>
            <div>
              <TokenAmountInput label="Unstake LP" value={unstakeAmount} decimals={lp.decimals} symbol={lp.symbol} balanceBaseAmount={stakedBalance} onChange={setUnstakeAmount} disabled={!canUseWallet} />
              {unstakeExceedsBalance ? <p className="error-text">Unstake amount exceeds staked LP balance.</p> : null}
              <button type="button" disabled={!canUnstake} onClick={() => void submit("unstake")}>{unstakeButtonCopy(wallet.status, network.isWrongNetwork, parsedUnstake.isValid, unstakeBaseAmount, unstakeExceedsBalance, incentivesTx.isPending)}</button>
            </div>
          </div>
          <button type="button" disabled={!canClaim} onClick={() => void submit("claim")}>{claimButtonCopy(wallet.status, network.isWrongNetwork, hasPendingRewards, incentivesTx.isPending)}</button>
          {network.isWrongNetwork ? <p className="error-text">Switch to Juno to use incentives.</p> : null}
          {wallet.status !== "connected" ? <p className="empty-state">Connect a wallet to load staked LP balances, pending rewards, and claim actions.</p> : null}
        </>
      )}
    </section>
  );
}

function RewardList({ rewards, title, empty }: { rewards: Asset[]; title: string; empty: string }) {
  const nonZero = rewards.filter((reward) => isPositiveBaseAmount(reward.amount));
  return (
    <div>
      <h4>{title}</h4>
      {nonZero.length === 0 ? <p className="empty-state">{empty}</p> : (
        <ul className="asset-list">
          {nonZero.map((reward) => <li key={`${assetInfoLabel(reward.info)}-${reward.amount}`}>{formatAmount(reward.amount, 6)} {assetInfoLabel(reward.info)}</li>)}
        </ul>
      )}
    </div>
  );
}

function RewardInfoList({ rewards }: { rewards: RewardInfo[] }) {
  if (rewards.length === 0) return <p className="empty-state">No internal or external incentive programs are reported for this pool.</p>;
  return (
    <div>
      <h4>Reward programs</h4>
      <ul className="asset-list">
        {rewards.map((reward, index) => <li key={index}>{rewardTypeLabel(reward)} · rps {reward.rps}</li>)}
      </ul>
    </div>
  );
}

function rewardTypeLabel(reward: RewardInfo) {
  if ("int" in reward.reward) return `Internal ${assetInfoLabel(reward.reward.int)}`;
  return `External ${assetInfoLabel(reward.reward.ext.info)}`;
}

function assetInfoLabel(info: AssetInfo) {
  if ("native_token" in info) return info.native_token.denom;
  return info.token.contract_addr;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

function actionTitle(action: "stake" | "unstake" | "claim") {
  if (action === "stake") return "Stake LP";
  if (action === "unstake") return "Unstake LP";
  return "Claim rewards";
}

function stakeButtonCopy(walletStatus: string, wrongNetwork: boolean, valid: boolean, amount: string, exceeds: boolean, pending: boolean) {
  if (wrongNetwork) return "Switch to Juno to stake";
  if (walletStatus !== "connected") return "Connect wallet to stake";
  if (!valid || !isPositiveBaseAmount(amount)) return "Enter LP amount to stake";
  if (exceeds) return "Insufficient LP balance";
  return pending ? "Staking…" : "Stake LP";
}

function unstakeButtonCopy(walletStatus: string, wrongNetwork: boolean, valid: boolean, amount: string, exceeds: boolean, pending: boolean) {
  if (wrongNetwork) return "Switch to Juno to unstake";
  if (walletStatus !== "connected") return "Connect wallet to unstake";
  if (!valid || !isPositiveBaseAmount(amount)) return "Enter LP amount to unstake";
  if (exceeds) return "Insufficient staked LP";
  return pending ? "Unstaking…" : "Unstake LP";
}

function claimButtonCopy(walletStatus: string, wrongNetwork: boolean, hasPendingRewards: boolean, pending: boolean) {
  if (wrongNetwork) return "Switch to Juno to claim";
  if (walletStatus !== "connected") return "Connect wallet to claim";
  if (!hasPendingRewards) return "No rewards to claim";
  return pending ? "Claiming…" : "Claim rewards";
}
