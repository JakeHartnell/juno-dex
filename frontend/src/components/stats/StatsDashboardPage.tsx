import { Link } from "react-router-dom";
import { enabledPools } from "../../config/registry";
import type { DataAccessState } from "../../lib/data-access/indexerFallback";
import { dashboardUnavailableCopy, formatInteger, formatPercent, formatUsdCompact, type StatsDashboardData, type TopPool } from "../../lib/stats/dashboard";
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
      <div className="hero-panel stats-hero">
        <p className="eyebrow">Protocol overview</p>
        <h2 id="stats-dashboard-title">Juno DEX stats</h2>
        <p>Track Juno DEX TVL, volume, fees, and top pools. When analytics are missing, the dashboard keeps routing users to Swap and Pools.</p>
        <div className="hero-actions">
          <Link className="primary-link" to="/swap">Go to Swap</Link>
          <Link className="secondary-link" to="/pools">Browse pools</Link>
        </div>
      </div>

      {unavailableCopy ? <div className="empty-state stats-unavailable" role="status">{unavailableCopy}</div> : null}

      <div className="stats-metric-grid" aria-label="Protocol metrics">
        <ProtocolMetric label="Total TVL" value={formatUsdCompact(stats?.tvlUsd)} isLoading={isLoading && !stats} />
        <ProtocolMetric label="24h volume" value={formatUsdCompact(stats?.volume24hUsd)} isLoading={isLoading && !stats} />
        <ProtocolMetric label="24h fees" value={formatUsdCompact(stats?.fees24hUsd)} isLoading={isLoading && !stats} />
        <ProtocolMetric label="Pools" value={formatInteger(stats?.poolCount)} detail={stats?.incentivizedPools !== undefined ? `${formatInteger(stats.incentivizedPools)} incentivized` : undefined} isLoading={isLoading && !stats} />
      </div>

      <section className="stats-chart-panel" aria-labelledby="stats-trend-title">
        <div>
          <p className="eyebrow">TVL / volume trend</p>
          <h3 id="stats-trend-title">Trend charts</h3>
        </div>
        <p>Historical chart series are not exposed by the current indexer stats payload yet. This panel intentionally shows no synthetic trend line; it will render as soon as real time-series data is available.</p>
      </section>

      <section className="stats-top-pools" aria-labelledby="top-pools-title">
        <div className="stats-section-header">
          <div>
            <p className="eyebrow">Top pools</p>
            <h3 id="top-pools-title">TVL, volume, and APR leaders</h3>
          </div>
          <Link to="/pools">View all pools</Link>
        </div>
        {data.topPools.length > 0 ? <TopPoolsTable pools={data.topPools} access={access} /> : <EmptyState title="Top pools unavailable">The indexer did not return pool TVL, volume, or APR rankings yet. Use the Pools page for registry-backed navigation.</EmptyState>}
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
      <div role="cell"><span>{formatUsdCompact(pool.tvlUsd)}</span></div>
      <div role="cell"><span>{formatUsdCompact(pool.volume24hUsd)}</span></div>
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
