import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { queryPairPool } from "../../lib/astroport/queries";
import { formatAmount } from "../../lib/format/amounts";
import { truncateAddress } from "../../lib/format/addresses";
import { buildPortfolioSummary, totalLpBalance, type PortfolioPosition } from "../../lib/portfolio/portfolio";
import { formatPositionSharePercent } from "../../lib/liquidity/position";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { useWalletIndexerData } from "../../queries/usePools";
import { useWalletBalances } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState, ErrorState, Skeleton } from "../common";
import { WalletAddressActions } from "../wallet/WalletAddressActions";

function usd(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "USD price unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function positionStatus(position: PortfolioPosition) {
  if (position.source === "indexer" || position.source === "mock") return "LP position";
  return "LP estimate";
}

function PortfolioPositionCard({ position }: { position: PortfolioPosition }) {
  const lpSymbol = `${position.pool.assets.map((asset) => asset.symbol).join("/")} LP`;
  const hasStaked = BigInt(position.stakedLpBalance ?? "0") > 0n;
  const hasRewards = position.rewards.some((reward) => reward.status === "claimable");

  return (
    <article className="lp-position-panel" aria-label={`${position.pool.label} portfolio position`}>
      <div className="lp-position-header">
        <div>
          <p className="eyebrow">{positionStatus(position)}</p>
          <h3>{position.pool.label}</h3>
          <p>{position.pool.assets.map((asset) => asset.symbol).join(" / ")} pool shares</p>
        </div>
        <span className="status-pill status-ok">Position found</span>
      </div>
      <div className="lp-position-metrics">
        <div className="metric-card">
          <span>Total LP exposure</span>
          <strong>{formatAmount(totalLpBalance(position), 6)} {lpSymbol}</strong>
          <details className="identifier-disclosure"><summary>LP token</summary><code>{position.pool.lpToken}</code></details>
        </div>
        <div className="metric-card">
          <span>Pool share</span>
          <strong>{formatPositionSharePercent(position.shareBps)}</strong>
          <code>{position.shareBps > 0 ? "Based on current position data" : "Share unavailable"}</code>
        </div>
        <div className="metric-card">
          <span>Position value</span>
          <strong>{usd(position.valueUsd)}</strong>
          <small>{position.valueUsd === null ? "Not counted in aggregate total" : "Priced with market data"}</small>
        </div>
      </div>

      <dl className="quote-details lp-underlying-list">
        <div>
          <dt>Unstaked LP</dt>
          <dd className="quote-detail-value">{formatAmount(position.lpBalance, 6)} {lpSymbol}</dd>
        </div>
        <div>
          <dt>Staked LP</dt>
          <dd className="quote-detail-value">{hasStaked ? `${formatAmount(position.stakedLpBalance ?? "0", 6)} ${lpSymbol}` : "Staked positions unavailable unless returned by indexer"}</dd>
        </div>
        {position.assets.map((asset) => (
          <div key={asset.denom}>
            <dt>{asset.symbol} underlying</dt>
            <dd className="quote-detail-value">
              {formatAmount(asset.amount, asset.decimals)} {asset.symbol}
              {asset.valueUsd === null ? <small> · USD price missing</small> : <small> · {usd(asset.valueUsd)}</small>}
            </dd>
          </div>
        ))}
        <div>
          <dt>Claimable rewards</dt>
          <dd className="quote-detail-value">
            {hasRewards ? position.rewards.map((reward) => `${formatAmount(reward.amount, 6)} ${reward.symbol} (${usd(reward.valueUsd)})`).join(", ") : "No claimable rewards reported; incentives contract query is not available in this frontend yet"}
          </dd>
        </div>
      </dl>
      <div className="lp-position-actions" aria-label="Portfolio position actions">
        <Link className="wallet-inline-action" to={`/pools/${position.pool.pair}`}>Manage liquidity</Link>
        <button className="wallet-inline-action" type="button" disabled title="Claim-all will enable once incentives reward query and execute wiring are available">
          Claim rewards unavailable
        </button>
      </div>
    </article>
  );
}

export function PortfolioPage() {
  const { wallet } = useWallet();
  const { pools, discovery } = useDexRegistry();
  const walletAddress = wallet.status === "connected" ? wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, pools);
  const indexerData = useWalletIndexerData(walletAddress);
  const reserveQueries = useQueries({
    queries: pools.map((pool) => ({
      queryKey: ["portfolio-pool", pool.pair],
      enabled: Boolean(walletAddress),
      queryFn: () => queryPairPool(pool.pair),
      staleTime: 30_000,
    })),
  });
  const reservesByPair = Object.fromEntries(pools.map((pool, index) => [pool.pair, reserveQueries[index]?.data]));
  const preferIndexer = Boolean(indexerData.access && !indexerData.access.isFallback && indexerData.data.positions.length > 0);
  const portfolio = buildPortfolioSummary({
    pools,
    balances: balances.data,
    reservesByPair,
    indexerPositions: indexerData.data.positions,
    preferIndexer,
  });
  const reserveError = reserveQueries.find((query) => query.isError)?.error;
  const isLoading = Boolean(walletAddress) && (balances.isLoading || indexerData.isLoading || reserveQueries.some((query) => query.isLoading));
  return (
    <section className="panel-page">
      <p className="eyebrow">Portfolio</p>
      <h2>Wallet portfolio</h2>
      <p>View LP positions, wallet balances, rewards, and estimated USD value in one place.</p>
      {discovery.isError ? <ErrorState title="Factory discovery unavailable" error="Showing curated registry fallback only; unknown factory pairs are not fabricated." onRetry={() => void discovery.refetch()} /> : null}
      {walletAddress ? <div className="contract-strip"><span>Wallet</span><WalletAddressActions address={walletAddress} /></div> : null}
      {!walletAddress ? <p className="pool-metrics-copy">Connect a wallet to view LP positions, balances, rewards, and USD value.</p> : null}
      {walletAddress && indexerData.access?.error ? <ErrorState title="Portfolio details unavailable" error="Some USD, rewards, and staked position details are temporarily unavailable." onRetry={() => void indexerData.refetch()} /> : null}

      {!walletAddress ? (
        <EmptyState title="Connect wallet to view portfolio" action={<Link className="wallet-inline-action" to="/pools">Browse pools</Link>}>
          LP balances and rewards are wallet-specific. The app remains read-only until a wallet is connected.
        </EmptyState>
      ) : balances.isError || reserveError ? (
        <ErrorState
          title="Portfolio fallback data unavailable"
          error={`${balances.isError ? `Wallet balances: ${balances.error instanceof Error ? balances.error.message : String(balances.error)}` : ""}${balances.isError && reserveError ? " · " : ""}${reserveError ? `Pool reserves: ${reserveError instanceof Error ? reserveError.message : String(reserveError)}` : ""}`}
          onRetry={() => {
            void balances.refetch();
            reserveQueries.forEach((query) => void query.refetch());
          }}
        />
      ) : isLoading ? (
        <div className="lp-position-skeleton" aria-label="Loading portfolio">
          <Skeleton width="70%" height="1.2rem" />
          <Skeleton width="55%" height="1.2rem" />
          <Skeleton width="85%" height="1.2rem" />
        </div>
      ) : (
        <>
          <div className="lp-position-metrics" aria-label="Portfolio totals">
            <div className="metric-card">
                  <span>Total LP value</span>
              <strong>{usd(portfolio.totalLpValueUsd)}</strong>
              <small>{portfolio.missingPositionPrices ? `${portfolio.missingPositionPrices} position(s) missing USD prices` : "All positions priced"}</small>
            </div>
            <div className="metric-card">
              <span>Total claimable</span>
              <strong>{usd(portfolio.totalClaimableUsd)}</strong>
              <small>{portfolio.claimableRewardCount ? `${portfolio.claimableRewardCount} reward row(s)` : "No rewards found"}</small>
            </div>
            <div className="metric-card">
              <span>Wallet balances</span>
              <strong>{portfolio.walletBalances.filter((balance) => BigInt(balance.amount || "0") > 0n).length}</strong>
              <small>Non-zero known balances</small>
            </div>
          </div>

          {portfolio.positions.length === 0 ? (
            <EmptyState title="No LP positions found" action={<Link className="wallet-inline-action" to="/pools">Explore pools</Link>}>
              No LP balance was found for this wallet. Staked-only positions will appear when available.
            </EmptyState>
          ) : (
            <div className="lp-position-list">
              {portfolio.positions.map((position) => <PortfolioPositionCard position={position} key={position.id} />)}
            </div>
          )}

          <section className="lp-position-panel" aria-label="Wallet token balances summary">
            <div className="lp-position-header">
              <div>
                <p className="eyebrow">Wallet balances</p>
                <h3>{wallet.name ?? truncateAddress(walletAddress)} balances</h3>
              </div>
            </div>
            <dl className="quote-details lp-underlying-list">
              {portfolio.walletBalances.filter((balance) => BigInt(balance.amount || "0") > 0n).slice(0, 12).map((balance) => (
                <div key={balance.denom}>
                  <dt>{balance.symbol}</dt>
                  <dd className="quote-detail-value">{formatAmount(balance.amount, balance.decimals)} <small>{balance.source}</small></dd>
                </div>
              ))}
              {portfolio.walletBalances.every((balance) => BigInt(balance.amount || "0") === 0n) ? <div><dt>No non-zero known balances</dt><dd className="quote-detail-value">—</dd></div> : null}
            </dl>
          </section>
        </>
      )}
    </section>
  );
}
