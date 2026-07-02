import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RegistryPool } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { truncateAddress } from "../../lib/format/addresses";
import {
  DEFAULT_POOL_LIST_CONTROLS,
  filterAndSortPools,
  getPoolTotalApr,
  type PoolIncentiveFilter,
  type PoolListControls,
  type PoolListSortKey,
  type PoolTypeFilter,
  type PoolVerifiedFilter,
} from "../../lib/pools/poolList";
import type { PoolMetrics } from "../../lib/pools/poolList";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { assessPoolRisk } from "../../lib/risk";
import { usePoolMetrics, usePoolReserves } from "../../queries/usePools";
import { getWalletBalanceAmount, useWalletBalances, type WalletBalance } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState, ErrorState, ExplorerLink, RiskBadgeList, Skeleton, TokenLogo } from "../common";

export function PoolTable({ pools }: { pools: RegistryPool[] }) {
  const [controls, setControls] = useState<PoolListControls>(DEFAULT_POOL_LIST_CONTROLS);
  const metrics = usePoolMetrics(pools);
  const wallet = useWallet();
  const walletAddress = wallet.wallet.status === "connected" ? wallet.wallet.address : undefined;
  const balances = useWalletBalances(walletAddress, pools);
  const visiblePools = useMemo(
    () => filterAndSortPools(pools, controls, metrics.data ?? {}),
    [controls, metrics.data, pools],
  );

  if (pools.length === 0) {
    return <EmptyState title="No enabled verified pools">Operators should add a real Juno pair to registry.juno-1.json and keep placeholders rejected by tests.</EmptyState>;
  }

  return (
    <div className="pool-list-shell">
      <PoolListControls controls={controls} onChange={setControls} />
      <p className="pool-metrics-copy">
        TVL, 24h volume, and APR use the indexer when configured. {metrics.data ? "Live metrics loaded." : "Metrics unavailable until the indexer/pricing service is configured; reserves remain live from pair queries."}
      </p>
      {metrics.isError ? <p className="error-text">Indexer metrics unavailable; showing reserve fallback without fake TVL, volume, or APR.</p> : null}
      <div className="pool-table" role="table" aria-label="Astroport pools">
        <div className="pool-table-header" role="row">
          <span role="columnheader">Pool</span>
          <button type="button" onClick={() => setControls((current) => toggleSort(current, "tvl"))}>TVL</button>
          <button type="button" onClick={() => setControls((current) => toggleSort(current, "volume"))}>24h volume</button>
          <button type="button" onClick={() => setControls((current) => toggleSort(current, "apr"))}>APR</button>
          <span role="columnheader">Fee tier</span>
          <span role="columnheader">Your position</span>
          <span role="columnheader">Actions</span>
        </div>
        {visiblePools.map((pool) => (
          <PoolRow
            balances={balances.data}
            metrics={metrics.data?.[pool.pair]}
            pool={pool}
            key={pool.id}
          />
        ))}
      </div>
      {visiblePools.length === 0 ? <EmptyState title="No pools match these filters">Try a different search term, pool type, verification, or incentive filter.</EmptyState> : null}
    </div>
  );
}

function PoolListControls({ controls, onChange }: { controls: PoolListControls; onChange: (controls: PoolListControls) => void }) {
  return (
    <div className="pool-list-controls" aria-label="Pool filters">
      <label>
        Search pools
        <input
          value={controls.search}
          onChange={(event) => onChange({ ...controls, search: event.target.value })}
          placeholder="Search by symbol, address, LP token…"
        />
      </label>
      <label>
        Pool type
        <select value={controls.type} onChange={(event) => onChange({ ...controls, type: event.target.value as PoolTypeFilter })}>
          <option value="all">All types</option>
          <option value="xyk">XYK</option>
          <option value="stable">Stable</option>
          <option value="concentrated">Concentrated</option>
        </select>
      </label>
      <label>
        Verification
        <select value={controls.verified} onChange={(event) => onChange({ ...controls, verified: event.target.value as PoolVerifiedFilter })}>
          <option value="all">All pools</option>
          <option value="verified">Verified only</option>
          <option value="unverified">Unverified only</option>
        </select>
      </label>
      <label>
        Incentives
        <select value={controls.incentivized} onChange={(event) => onChange({ ...controls, incentivized: event.target.value as PoolIncentiveFilter })}>
          <option value="all">All incentives</option>
          <option value="incentivized">Incentivized</option>
          <option value="unincentivized">Unincentivized</option>
        </select>
      </label>
      <label>
        Sort by
        <select value={controls.sortKey} onChange={(event) => onChange({ ...controls, sortKey: event.target.value as PoolListSortKey })}>
          <option value="featured">Featured</option>
          <option value="pool">Pool name</option>
          <option value="tvl">TVL</option>
          <option value="volume">24h volume</option>
          <option value="apr">APR</option>
        </select>
      </label>
    </div>
  );
}

function toggleSort(controls: PoolListControls, sortKey: PoolListSortKey): PoolListControls {
  return {
    ...controls,
    sortKey,
    sortDirection: controls.sortKey === sortKey && controls.sortDirection === "desc" ? "asc" : "desc",
  };
}

function PoolRow({ pool, metrics, balances }: { pool: RegistryPool; metrics?: PoolMetrics; balances?: readonly WalletBalance[] }) {
  const reserves = usePoolReserves(pool);
  const risk = assessPoolRisk(pool, reserves.data);
  const lpBalance = getWalletBalanceAmount(balances, pool.lpToken);
  const poolType = getPoolTypeMetadata(pool.type);
  return (
    <article className="pool-row" role="row">
      <div className="pool-main" role="cell">
        <div className="pool-title-line">
          <strong>{pool.label}</strong>
          <RiskBadgeList assessment={risk} max={4} />
          <span className={`status-pill ${poolType.badgeClass}`}>{poolType.shortLabel}</span>
          {metrics?.incentivized || (metrics?.incentivesApr ?? 0) > 0 ? <span className="status-pill status-ok">incentivized</span> : null}
        </div>
        <p>{pool.notes}</p>
        <div className="pool-assets">
          {pool.assets.map((asset, index) => (
            <div key={asset.id}>
              <span className="pool-asset-heading"><TokenLogo asset={asset} size="sm" /> {asset.symbol}</span>
              {asset.name ? <small>{asset.name}</small> : null}
              <strong>{reserves.isLoading ? <Skeleton width="9rem" /> : reserves.data ? formatAmount(reserves.data.assets[index]?.amount, asset.decimals) : "reserve unavailable"}</strong>
              {asset.denomTrace ? <small title={asset.denomTrace}>{asset.denomTrace}</small> : null}
              <code>{asset.id}</code>
            </div>
          ))}
        </div>
        {reserves.isError ? <ErrorState title="RPC degraded" error="Reserves unavailable; registry metadata remains visible." onRetry={() => void reserves.refetch()} /> : null}
      </div>
      <MetricCell label="TVL" value={formatUsd(metrics?.tvlUsd)} />
      <MetricCell label="24h volume" value={formatUsd(metrics?.volume24hUsd)} />
      <MetricCell label="APR" value={formatApr(getPoolTotalApr(metrics))} />
      <div className="pool-meta" role="cell">
        <span>Type</span>
        <strong>{poolType.label}</strong>
        <small>{poolType.description}</small>
        <span>Fee tier</span>
        <strong>{pool.feeBps} bps</strong>
        <code>{truncateAddress(pool.pair)}</code>
        <ExplorerLink href={pool.explorer}>Mintscan</ExplorerLink>
      </div>
      <div className="pool-position" role="cell">
        <span>Your position</span>
        <strong>{lpBalance && lpBalance !== "0" ? formatAmount(lpBalance, 6) : "No LP detected"}</strong>
      </div>
      <div className="pool-actions" role="cell">
        <Link to="/swap">Swap</Link>
        <Link to={`/pools/${pool.pair}`}>Add</Link>
        <Link to={`/pools/${pool.pair}`}>Details</Link>
      </div>
    </article>
  );
}

function MetricCell({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="pool-metric" role="cell">
      <span>{label}</span>
      <strong>{value ?? "Metrics unavailable"}</strong>
      {value ? null : <small>Coming from indexer</small>}
    </div>
  );
}

function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatApr(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}
