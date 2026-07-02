import { Link } from "react-router-dom";
import type { RegistryPool } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { estimateLpPosition, formatPositionSharePercent } from "../../lib/liquidity/position";
import { usePoolReserves } from "../../queries/usePools";
import { getWalletBalanceAmount, resolveDenom, useWalletBalances } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState, ErrorState, Skeleton } from "../common";

type LpPositionPanelProps = {
  pool: RegistryPool;
  compact?: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function LpPositionPanel({ pool, compact = false }: LpPositionPanelProps) {
  const { wallet } = useWallet();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, [pool]);
  const reserves = usePoolReserves(pool);
  const lp = resolveDenom(pool.lpToken, [pool]);
  const lpBalance = getWalletBalanceAmount(balances.data, pool.lpToken);
  const isLoading = wallet.status === "connected" && (balances.isLoading || reserves.isLoading);
  const hasError = balances.isError || reserves.isError;
  const position = estimateLpPosition(reserves.data, lpBalance);
  const poolHref = `/pools/${pool.pair}`;

  return (
    <section className={`lp-position-panel ${compact ? "lp-position-panel-compact" : ""}`} aria-label={`${pool.label} LP position`}>
      <div className="lp-position-header">
        <div>
          <p className="eyebrow">LP position</p>
          <h3>{pool.label}</h3>
          <p>{pool.assets.map((asset) => asset.symbol).join(" / ")} pool shares</p>
        </div>
        <span className={position.hasPosition ? "status-pill status-ok" : "status-pill status-warn"}>
          {position.hasPosition ? "Position found" : "No LP balance"}
        </span>
      </div>

      {wallet.status !== "connected" ? (
        <EmptyState title="Connect wallet to view LP position">LP balances, pool share, and underlying token estimates require a connected wallet.</EmptyState>
      ) : hasError ? (
        <ErrorState
          title="LP position unavailable"
          error={`${balances.isError ? `Wallet balances: ${errorMessage(balances.error)}` : ""}${balances.isError && reserves.isError ? " · " : ""}${reserves.isError ? `Pool reserves: ${errorMessage(reserves.error)}` : ""}`}
          onRetry={() => {
            void balances.refetch();
            void reserves.refetch();
          }}
        />
      ) : isLoading ? (
        <div className="lp-position-skeleton" aria-label="Loading LP position">
          <Skeleton width="70%" height="1.2rem" />
          <Skeleton width="55%" height="1.2rem" />
          <Skeleton width="85%" height="1.2rem" />
        </div>
      ) : !position.hasPosition ? (
        <EmptyState title="No LP balance for this pool" action={<Link className="wallet-inline-action" to={poolHref}>Add liquidity</Link>}>
          Your wallet does not currently hold {lp.symbol}. Add liquidity to mint LP shares for this pool.
        </EmptyState>
      ) : (
        <>
          <div className="lp-position-metrics">
            <div className="metric-card">
              <span>Wallet LP balance</span>
              <strong>{formatAmount(position.lpBalance, lp.decimals)} {lp.symbol}</strong>
              <code>{pool.lpToken}</code>
            </div>
            <div className="metric-card">
              <span>Pool share</span>
              <strong>{formatPositionSharePercent(position.shareBps)}</strong>
              <code>{formatAmount(position.totalShare, lp.decimals)} total LP</code>
            </div>
          </div>
          <dl className="quote-details lp-underlying-list">
            {pool.assets.map((asset, index) => (
              <div key={asset.id}>
                <dt>{asset.symbol} underlying estimate</dt>
                <dd className="quote-detail-value">
                  {position.underlyingAssets[index]
                    ? `${formatAmount(position.underlyingAssets[index].amount, asset.decimals)} ${asset.symbol}`
                    : "—"}
                </dd>
              </div>
            ))}
            <div>
              <dt>Underlying value</dt>
              <dd className="quote-detail-value">USD pricing unavailable</dd>
            </div>
          </dl>
        </>
      )}

      <div className="lp-position-actions" aria-label="LP quick actions">
        <Link className="wallet-inline-action" to={poolHref}>Add liquidity</Link>
        <Link className="wallet-inline-action" to={poolHref}>Remove liquidity</Link>
        <button className="wallet-inline-action" type="button" disabled title="Staking is not enabled in this frontend yet">Stake soon</button>
      </div>
    </section>
  );
}
