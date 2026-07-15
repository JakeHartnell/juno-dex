import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { queryPairPool } from "../../lib/astroport/queries";
import { formatAmount } from "../../lib/format/amounts";
import { truncateAddress } from "../../lib/format/addresses";
import { queryIncentivesPoolState } from "../../lib/incentives";
import { buildPortfolioSummary, totalLpBalance, type PortfolioPosition } from "../../lib/portfolio/portfolio";
import { formatPositionSharePercent } from "../../lib/liquidity/position";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { useWalletIndexerData } from "../../queries/usePools";
import { useWalletBalances } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState, ErrorState, OptionalDataState, Skeleton } from "../common";
import { WalletTransactionHistory } from "../wallet/WalletTransactionHistory";

function usd(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "USD price unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function juno(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} JUNO`;
}

function marketValue(usdValue: number | null, junoValue: number | null) {
  return typeof usdValue === "number" && Number.isFinite(usdValue) ? usd(usdValue) : (juno(junoValue) ?? "Price unavailable");
}

function hasMarketValue(usdValue: number | null, junoValue: number | null) {
  return typeof usdValue === "number" && Number.isFinite(usdValue) || typeof junoValue === "number" && Number.isFinite(junoValue);
}

function positionStatus(position: PortfolioPosition) {
  if (position.source === "indexer" || position.source === "mock") return "LP position";
  return "LP estimate";
}

function MetricValue({ muted = false, children }: { muted?: boolean; children: ReactNode }) {
  return <strong className={muted ? "metric-value metric-value-muted" : "metric-value"}>{children}</strong>;
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
          <MetricValue>{formatAmount(totalLpBalance(position), 6)} {lpSymbol}</MetricValue>
          <details className="identifier-disclosure"><summary>LP token</summary><code>{position.pool.lpToken}</code></details>
        </div>
        <div className="metric-card">
          <span>Pool share</span>
          <MetricValue>{formatPositionSharePercent(position.shareBps)}</MetricValue>
          <code>{position.shareBps > 0 ? "Based on current position data" : "Share unavailable"}</code>
        </div>
        <div className="metric-card">
          <span>Position value</span>
          <MetricValue muted={!hasMarketValue(position.valueUsd, position.valueJuno)}>{marketValue(position.valueUsd, position.valueJuno)}</MetricValue>
          <small>{hasMarketValue(position.valueUsd, position.valueJuno) ? "Priced with market data" : "Not counted in aggregate total"}</small>
        </div>
      </div>

      <dl className="quote-details lp-underlying-list">
        <div>
          <dt>Unstaked LP</dt>
          <dd className="quote-detail-value">{formatAmount(position.lpBalance, 6)} {lpSymbol}</dd>
        </div>
        <div>
          <dt>Staked LP</dt>
          <dd className="quote-detail-value">{hasStaked ? `${formatAmount(position.stakedLpBalance ?? "0", 6)} ${lpSymbol}` : "No staked balance reported"}</dd>
        </div>
        {position.assets.map((asset) => (
          <div key={asset.denom}>
            <dt>{asset.symbol} underlying</dt>
            <dd className="quote-detail-value">
              {formatAmount(asset.amount, asset.decimals)} {asset.symbol}
              {hasMarketValue(asset.valueUsd, asset.valueJuno) ? <small> · {marketValue(asset.valueUsd, asset.valueJuno)}</small> : <small> · price missing</small>}
            </dd>
          </div>
        ))}
        <div>
          <dt>Claimable rewards</dt>
          <dd className="quote-detail-value">
            {hasRewards ? position.rewards.map((reward) => `${formatAmount(reward.amount, 6)} ${reward.symbol} (${marketValue(reward.valueUsd, reward.valueJuno)})`).join(", ") : "No claimable rewards reported"}
          </dd>
        </div>
      </dl>
      <div className="lp-position-actions" aria-label="Portfolio position actions">
        <Link className="wallet-inline-action" to={`/pools/${position.pool.pair}`}>Manage liquidity</Link>
      </div>
    </article>
  );
}

export function PortfolioPage() {
  const { wallet } = useWallet();
  const { pools, discovery, registry } = useDexRegistry();
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
  const incentivesQueries = useQueries({
    queries: pools.map((pool) => ({
      queryKey: ["portfolio-incentives", pool.lpToken, walletAddress],
      enabled: Boolean(walletAddress),
      queryFn: () => queryIncentivesPoolState(pool, walletAddress),
      staleTime: 20_000,
      retry: false,
    })),
  });
  const reservesByPair = Object.fromEntries(pools.map((pool, index) => [pool.pair, reserveQueries[index]?.data]));
  const incentivesByLpToken = Object.fromEntries(pools.map((pool, index) => [pool.lpToken, incentivesQueries[index]?.data]));
  const preferIndexer = Boolean(indexerData.access && !indexerData.access.isFallback && indexerData.data.positions.length > 0);
  const portfolio = buildPortfolioSummary({
    pools,
    balances: balances.data,
    reservesByPair,
    indexerPositions: indexerData.data.positions,
    incentivesByLpToken,
    preferIndexer,
  });
  const reserveError = reserveQueries.find((query) => query.isError)?.error;
  const isLoading = Boolean(walletAddress) && (balances.isLoading || indexerData.isLoading || reserveQueries.some((query) => query.isLoading) || incentivesQueries.some((query) => query.isLoading));
  return (
    <section className="panel-page portfolio-page">
      <div className="portfolio-hero">
        <div className="portfolio-hero-lead">
          <p className="eyebrow">Portfolio</p>
          <h2>Wallet portfolio</h2>
        </div>
        {walletAddress ? (
          <div className="portfolio-wallet-chip" aria-label="Connected wallet">
            <span />
            <code title={walletAddress}>{wallet.name ?? truncateAddress(walletAddress)}</code>
          </div>
        ) : null}
      </div>
      {discovery.isError ? <OptionalDataState title="Some positions may be missing" onRetry={() => void discovery.refetch()}>Known positions remain available.</OptionalDataState> : null}
      {!walletAddress ? <p className="pool-metrics-copy">Connect a wallet to view LP positions, balances, rewards, and USD value.</p> : null}
      {walletAddress && indexerData.access?.error ? <OptionalDataState title="Some portfolio details are unavailable" onRetry={() => void indexerData.refetch()}>Balances remain available; prices, rewards, or staked amounts may be incomplete.</OptionalDataState> : null}

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
        <div className="lp-position-skeleton" role="status" aria-label="Loading portfolio">
          <Skeleton width="70%" height="1.2rem" />
          <Skeleton width="55%" height="1.2rem" />
          <Skeleton width="85%" height="1.2rem" />
        </div>
      ) : (
        <>
          <div className="lp-position-metrics portfolio-total-grid" aria-label="Portfolio totals">
            <div className="metric-card">
              <span>Total LP value</span>
              <MetricValue muted={!hasMarketValue(portfolio.totalLpValueUsd, portfolio.totalLpValueJuno)}>{marketValue(portfolio.totalLpValueUsd, portfolio.totalLpValueJuno)}</MetricValue>
              <small>{portfolio.missingPositionPrices ? `${portfolio.missingPositionPrices} position(s) missing prices` : "All positions priced"}</small>
            </div>
            <div className="metric-card">
              <span>Total claimable</span>
              <MetricValue muted={portfolio.claimableRewardCount === 0 || !hasMarketValue(portfolio.totalClaimableUsd, portfolio.totalClaimableJuno)}>{portfolio.claimableRewardCount ? marketValue(portfolio.totalClaimableUsd, portfolio.totalClaimableJuno) : "No rewards found"}</MetricValue>
              {portfolio.claimableRewardCount ? <small>{portfolio.claimableRewardCount} reward row(s)</small> : null}
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

          <WalletTransactionHistory
            history={indexerData.data.history}
            access={indexerData.access}
            explorerBaseUrl={registry.explorerBaseUrl}
            walletConnected={Boolean(walletAddress)}
            isLoading={indexerData.isLoading}
          />
        </>
      )}
    </section>
  );
}
