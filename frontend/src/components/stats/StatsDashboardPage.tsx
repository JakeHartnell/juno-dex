import { Link } from "react-router-dom";
import { enabledPools } from "../../config/registry";
import type { DataAccessState } from "../../lib/data-access/indexerFallback";
import { dashboardUnavailableCopy, formatInteger, formatMarketValue, formatPercent, type StatsDashboardData, type TopPool } from "../../lib/stats/dashboard";
import { useStatsDashboard } from "../../queries/usePools";
import { EmptyState, Skeleton } from "../common";

export function StatsDashboardPage() {
  const dashboard = useStatsDashboard(enabledPools);
  return <StatsDashboardView data={dashboard.data} access={dashboard.access} isLoading={dashboard.isLoading} />;
}

export function StatsDashboardView({ data, access, isLoading = false }: { data: StatsDashboardData; access?: DataAccessState; isLoading?: boolean }) {
  const stats = data.stats;
  const unavailableCopy = dashboardUnavailableCopy(access);
  return (
    <section className="stats-dashboard-page" aria-labelledby="stats-dashboard-title">
      <header className="stats-hero">
        <div className="stats-hero-copy">
          <p className="eyebrow">Protocol overview</p>
          <h2 id="stats-dashboard-title">Juno DEX stats</h2>
        </div>
        <div className="hero-actions">
          <Link className="primary-link" to="/swap">Go to Swap</Link>
          <Link className="secondary-link" to="/pools">Browse pools</Link>
        </div>
      </header>

      {unavailableCopy ? <p className="stats-notice" role="status">{unavailableCopy}</p> : null}

      <div className="stats-metric-grid" aria-label="Protocol metrics">
        <ProtocolMetric label="Total TVL" value={formatMarketValue(stats?.tvlUsd, stats?.tvlJuno)} isLoading={isLoading && !stats} />
        <ProtocolMetric label="24h volume" value={formatMarketValue(stats?.volume24hUsd, stats?.volume24hJuno)} isLoading={isLoading && !stats} />
        <ProtocolMetric label="24h fees" value={formatMarketValue(stats?.fees24hUsd, stats?.fees24hJuno)} isLoading={isLoading && !stats} />
        <ProtocolMetric label="Pools" value={formatInteger(stats?.poolCount)} detail={stats?.incentivizedPools !== undefined ? `${formatInteger(stats.incentivizedPools)} incentivized` : undefined} isLoading={isLoading && !stats} />
      </div>

      <section className="stats-chart-panel" aria-labelledby="stats-trend-title">
        <div>
          <p className="eyebrow">TVL / volume trend</p>
          <h3 id="stats-trend-title">Trend charts</h3>
        </div>
        <p>Historical trends are not available yet. Current totals remain available above.</p>
      </section>

      <section className="stats-top-pools" aria-labelledby="top-pools-title">
        <div className="stats-section-header">
          <div>
            <p className="eyebrow">Top pools</p>
            <h3 id="top-pools-title">TVL, volume, and APR leaders</h3>
          </div>
          <Link to="/pools">View all pools</Link>
        </div>
        {data.topPools.length > 0 ? <TopPoolsTable pools={data.topPools} access={access} /> : <EmptyState title="Top pools unavailable">Rankings could not be loaded. You can still browse known pools from the Pools page.</EmptyState>}
      </section>
    </section>
  );
}

function ProtocolMetric({ label, value, detail, isLoading }: { label: string; value: string; detail?: string; isLoading?: boolean }) {
  return (
    <article className="metric-card stats-metric-card">
      <span>{label}</span>
      <strong>{isLoading ? <Skeleton width="7rem" /> : value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function TopPoolsTable({ pools, access }: { pools: TopPool[]; access?: DataAccessState }) {
  return (
    <div className="stats-top-pool-table" role="table" aria-label="Top pools by market metrics">
      <div className="stats-top-pool-row stats-top-pool-head" role="row">
        <span role="columnheader">Pool</span>
        <span role="columnheader">TVL</span>
        <span role="columnheader">24h volume</span>
        <span role="columnheader">APR</span>
        <span role="columnheader">Actions</span>
      </div>
      {pools.map((pool) => <TopPoolRow key={`${pool.id}-${pool.pair}`} pool={pool} access={access} />)}
    </div>
  );
}

function TopPoolRow({ pool, access }: { pool: TopPool; access?: DataAccessState }) {
  return (
    <article className="stats-top-pool-row" role="row">
      <div role="cell">
        <strong>{pool.label}</strong>
        {pool.updatedAt ? <small>Updated {formatUpdatedAt(pool.updatedAt)}</small> : null}
      </div>
      <div role="cell"><span>{formatMarketValue(pool.tvlUsd, pool.tvlJuno)}</span></div>
      <div role="cell"><span>{formatMarketValue(pool.volume24hUsd, pool.volume24hJuno)}</span></div>
      <div role="cell"><span>{formatPercent(pool.totalApr ?? pool.feeApr)}</span></div>
      <div className="pool-actions" role="cell">
        <Link to="/swap">Swap</Link>
        <Link to={`/pools/${pool.pair}`}>Add</Link>
        <Link to={`/pools/${pool.pair}`}>Details</Link>
      </div>
    </article>
  );
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "timestamp unavailable";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
