import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { RegistryPool } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import type { DataAccessState } from "../../lib/data-access/indexerFallback";
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
import { usePoolMetrics } from "../../queries/usePools";
import { getWalletBalanceAmount, useWalletBalances, type WalletBalance } from "../../queries/useWalletBalances";
import { useWallet } from "../../wallet/WalletContext";
import { EmptyState, TokenLogo } from "../common";

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
      <div className="pool-table" role="table" aria-label="Juno pools">
        <div className="pool-table-header" role="row">
          <span role="columnheader">Pool node</span>
          <span role="columnheader" aria-sort={ariaSort(controls, "tvl")}><button type="button" onClick={() => setControls((current) => toggleSort(current, "tvl"))}>TVL <SortDirection controls={controls} sortKey="tvl" /></button></span>
          <span role="columnheader" aria-sort={ariaSort(controls, "apr")}><button type="button" onClick={() => setControls((current) => toggleSort(current, "apr"))}>APR <SortDirection controls={controls} sortKey="apr" /></button></span>
          <span role="columnheader" aria-sort={ariaSort(controls, "volume")}><button type="button" onClick={() => setControls((current) => toggleSort(current, "volume"))}>24h vol <SortDirection controls={controls} sortKey="volume" /></button></span>
          <span role="columnheader">Your position</span>
        </div>
        {visiblePools.map((pool) => (
          <PoolRow
            balances={balances.data}
            metrics={metrics.data?.[pool.pair]}
            access={metrics.access}
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
      <label className="pool-list-search">
        Search pools
        <input
          value={controls.search}
          onChange={(event) => onChange({ ...controls, search: event.target.value })}
          placeholder="Symbol, address, LP token…"
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

function ariaSort(controls: PoolListControls, sortKey: PoolListSortKey): "ascending" | "descending" | "none" {
  if (controls.sortKey !== sortKey) return "none";
  return controls.sortDirection === "asc" ? "ascending" : "descending";
}

function SortDirection({ controls, sortKey }: { controls: PoolListControls; sortKey: PoolListSortKey }) {
  return <span aria-hidden="true">{controls.sortKey === sortKey ? controls.sortDirection === "asc" ? "↑" : "↓" : "↕"}</span>;
}

function PoolRow({ pool, metrics, balances, access }: { pool: RegistryPool; metrics?: PoolMetrics; balances?: readonly WalletBalance[]; access?: DataAccessState }) {
  const lpBalance = getWalletBalanceAmount(balances, pool.lpToken);
  const apr = getPoolTotalApr(metrics);
  return (
    <Link className="pool-row" role="row" to={`/pools/${pool.pair}`} aria-label={`Open ${pool.label} pool details`}>
      <div className="pool-main" role="cell">
        <div className="pool-title-line">
          <span className="pool-token-stack" aria-hidden="true">
            {pool.assets.slice(0, 2).map((asset) => <TokenLogo key={asset.id} asset={asset} size="sm" />)}
          </span>
          <div className="pool-title-copy">
            <strong>{pool.label}</strong>
          </div>
        </div>
      </div>
      <MetricCell label="TVL" value={formatMarketValue(metrics?.tvlUsd, metrics?.tvlJuno)} metrics={metrics} access={access} />
      <MetricCell label="APR" value={formatApr(apr)} metrics={metrics} access={access} tone="apr" />
      <MetricCell label="24h vol" value={formatMarketValue(metrics?.volume24hUsd, metrics?.volume24hJuno)} metrics={metrics} access={access} />
      <div className="pool-position" role="cell">
        <span>Your position</span>
        <strong>{lpBalance && lpBalance !== "0" ? formatAmount(lpBalance, 6) : "No LP detected"}</strong>
      </div>
    </Link>
  );
}

function MetricCell({ label, value, metrics, access, tone }: { label: string; value: string | undefined; metrics?: PoolMetrics; access?: DataAccessState; tone?: "apr" }) {
  return (
    <div className={tone === "apr" ? "pool-metric pool-metric-apr" : "pool-metric"} role="cell">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      {value && access && !access.isStale ? <small>live</small> : null}
    </div>
  );
}

function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatJuno(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} JUNO`;
}

function formatMarketValue(usdValue: number | null | undefined, junoValue: number | null | undefined) {
  return formatUsd(usdValue) ?? formatJuno(junoValue);
}

function formatApr(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}
