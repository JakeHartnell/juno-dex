import { Link } from "react-router-dom";
import type { RegistryPool } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { truncateAddress } from "../../lib/format/addresses";
import { assessPoolRisk } from "../../lib/risk";
import { usePoolReserves } from "../../queries/usePools";
import { EmptyState, ErrorState, ExplorerLink, RiskBadgeList, Skeleton, TokenLogo } from "../common";

export function PoolTable({ pools }: { pools: RegistryPool[] }) {
  if (pools.length === 0) {
    return <EmptyState title="No enabled verified pools">Operators should add a real Juno pair to registry.juno-1.json and keep placeholders rejected by tests.</EmptyState>;
  }

  return (
    <div className="pool-table">
      {pools.map((pool) => <PoolRow pool={pool} key={pool.id} />)}
    </div>
  );
}

function PoolRow({ pool }: { pool: RegistryPool }) {
  const reserves = usePoolReserves(pool);
  const risk = assessPoolRisk(pool, reserves.data);
  return (
    <article className="pool-row">
      <div className="pool-main">
        <div className="pool-title-line">
          <strong>{pool.label}</strong>
          <RiskBadgeList assessment={risk} max={4} />
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
      <div className="pool-meta">
        <span>{pool.type.toUpperCase()} · {pool.feeBps} bps</span>
        <code>{truncateAddress(pool.pair)}</code>
        <ExplorerLink href={pool.explorer}>Mintscan</ExplorerLink>
      </div>
      <div className="pool-actions">
        <Link to="/swap">Swap</Link>
        <Link to={`/pools/${pool.pair}`}>Add</Link>
        <Link to={`/pools/${pool.pair}`}>Details</Link>
      </div>
    </article>
  );
}
