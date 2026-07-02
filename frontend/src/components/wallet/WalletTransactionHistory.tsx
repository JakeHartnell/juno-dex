import { useMemo, useState } from "react";
import type { DataAccessState } from "../../lib/data-access/indexerFallback";
import { dataSourceLabel } from "../../lib/data-access/indexerFallback";
import type { IndexerAssetAmount, IndexerWalletTransaction } from "../../lib/indexer/types";
import { ExplorerLink, EmptyState, Skeleton } from "../common";

export type WalletTransactionTypeFilter = "all" | "swap" | "provide_liquidity" | "withdraw_liquidity" | "claim_rewards";

const TYPE_OPTIONS: { value: WalletTransactionTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "swap", label: "Swaps" },
  { value: "provide_liquidity", label: "Adds" },
  { value: "withdraw_liquidity", label: "Withdraws" },
  { value: "claim_rewards", label: "Claims" },
];

const TYPE_LABELS: Record<string, string> = {
  swap: "Swap",
  provide_liquidity: "Add liquidity",
  withdraw_liquidity: "Remove liquidity",
  claim_rewards: "Claim rewards",
};

type WalletTransactionHistoryProps = {
  history: readonly IndexerWalletTransaction[];
  access?: DataAccessState;
  explorerBaseUrl: string;
  walletConnected: boolean;
  isLoading?: boolean;
  pairAddress?: string;
  title?: string;
  emptyTitle?: string;
};

export function WalletTransactionHistory({
  history,
  access,
  explorerBaseUrl,
  walletConnected,
  isLoading = false,
  pairAddress,
  title = "Wallet transaction history",
  emptyTitle,
}: WalletTransactionHistoryProps) {
  const [typeFilter, setTypeFilter] = useState<WalletTransactionTypeFilter>("all");
  const filtered = useMemo(() => history
    .filter((tx) => !pairAddress || tx.pairAddress === pairAddress || tx.poolId === pairAddress)
    .filter((tx) => typeFilter === "all" || tx.type === typeFilter), [history, pairAddress, typeFilter]);
  const hasIndexerFailure = Boolean(access?.isFallback || access?.source === "disabled" || access?.error);

  return (
    <section className="wallet-history-section" aria-labelledby="wallet-history-title">
      <div className="wallet-history-header">
        <div>
          <p className="eyebrow">Activity</p>
          <h3 id="wallet-history-title">{title}</h3>
          <p className="pool-metrics-copy">Source: {dataSourceLabel(access)}. Indexed swaps, add/remove liquidity, and reward claims are shown only when the configured indexer returns real wallet activity.</p>
        </div>
        <div className="wallet-history-source" aria-label="Wallet history source markers">
          {access?.source ? <span className="status-pill status-ok">{access.source}</span> : null}
          {access?.isMock ? <span className="status-pill status-warn">mock</span> : null}
          {access?.isStale ? <span className="status-pill status-warn">stale</span> : null}
        </div>
      </div>

      <div className="wallet-history-filters" aria-label="Wallet transaction type filters">
        {TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`mode-tab ${typeFilter === option.value ? "active" : ""}`}
            aria-pressed={typeFilter === option.value}
            onClick={() => setTypeFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!walletConnected ? (
        <EmptyState title="Connect wallet to view transaction history">Wallet activity is fetched per address from the configured indexer. No mock transactions are displayed.</EmptyState>
      ) : isLoading ? (
        <div className="wallet-history-list" aria-label="Loading wallet transaction history">
          <Skeleton width="100%" height="3.5rem" />
          <Skeleton width="100%" height="3.5rem" />
          <Skeleton width="100%" height="3.5rem" />
        </div>
      ) : hasIndexerFailure ? (
        <EmptyState title="Wallet history unavailable">{access?.error ? `Indexer wallet history unavailable (${access.error.message}).` : "Indexer wallet history is unavailable."} No fallback fabricates transaction rows; use Mintscan for live wallet activity.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title={emptyTitle ?? "No indexed wallet transactions"}>No {typeFilter === "all" ? "swap, add, withdraw, or claim" : TYPE_OPTIONS.find((option) => option.value === typeFilter)?.label.toLowerCase()} activity was returned for this {pairAddress ? "pool" : "wallet"}. No fake rows are shown.</EmptyState>
      ) : (
        <div className="wallet-history-list" role="table" aria-label="Wallet transaction history">
          <div className="wallet-history-row wallet-history-row-head" role="row">
            <span role="columnheader">Time</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Pool / assets</span>
            <span role="columnheader">Value / fee</span>
            <span role="columnheader">Tx</span>
          </div>
          {filtered.map((tx) => (
            <article className="wallet-history-row" role="row" key={`${tx.txHash}-${tx.type}-${tx.height}`}>
              <div role="cell"><strong>{formatTimestamp(tx.timestamp)}</strong><small>Height {tx.height.toLocaleString()}</small></div>
              <div role="cell"><span className="status-pill status-ok">{formatType(tx.type)}</span>{!tx.success ? <small className="error-text">failed</small> : null}</div>
              <div role="cell"><strong>{formatAssetFlow(tx)}</strong><code>{tx.pairAddress ?? tx.poolId ?? "Pool unavailable"}</code></div>
              <div role="cell"><strong>{formatUsd(tx.amountUsd) ?? "USD unavailable"}</strong><small>Fee {formatUsd(tx.feeUsd) ?? "unavailable"}</small></div>
              <div role="cell" className="wallet-history-tx-cell">
                <ExplorerLink href={`${explorerBaseUrl}/tx/${tx.txHash}`}>{shortHash(tx.txHash)}</ExplorerLink>
                <div className="wallet-history-source">
                  <span className="risk-badge risk-badge-info">{tx.dataSource || access?.source || "indexer"}</span>
                  {tx.isMock ? <span className="risk-badge risk-badge-warning">mock</span> : null}
                  {access?.isStale ? <span className="risk-badge risk-badge-warning">stale</span> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatType(type: string) {
  return TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

function txAssets(tx: IndexerWalletTransaction): IndexerAssetAmount[] {
  const dynamic = tx as IndexerWalletTransaction & { assets?: IndexerAssetAmount[]; rewards?: IndexerAssetAmount[]; withdrawnAssets?: IndexerAssetAmount[]; providedAssets?: IndexerAssetAmount[] };
  const listed = dynamic.assets ?? dynamic.rewards ?? dynamic.withdrawnAssets ?? dynamic.providedAssets;
  if (listed?.length) return listed;
  return [tx.offerAsset, tx.askAsset].filter((asset): asset is IndexerAssetAmount => Boolean(asset));
}

export function formatAssetFlow(tx: IndexerWalletTransaction) {
  if (tx.type === "swap" && tx.offerAsset && tx.askAsset) {
    return `${formatAssetAmount(tx.offerAsset)} → ${formatAssetAmount(tx.askAsset)}`;
  }
  const assets = txAssets(tx).map(formatAssetAmount).filter(Boolean);
  if (assets.length > 0) return assets.join(" + ");
  return "Assets unavailable";
}

export function formatAssetAmount(asset: IndexerAssetAmount) {
  const amount = asset.amount ?? asset.reserve;
  const symbol = asset.symbol ?? asset.denom;
  if (!amount) return symbol;
  return `${formatCompactDecimal(amount)} ${symbol}`;
}

export function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
}

function formatCompactDecimal(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(numeric);
}

function shortHash(hash: string) {
  return hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}
