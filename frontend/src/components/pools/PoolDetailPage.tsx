import { Link, useParams } from "react-router-dom";
import { enabledPools } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { usePoolReserves } from "../../queries/usePools";
import { ExplorerLink } from "../common/ExplorerLink";
import { AddLiquidityForm } from "../liquidity/AddLiquidityForm";
import { LpPositionPanel } from "../liquidity/LpPositionPanel";
import { RemoveLiquidityForm } from "../liquidity/RemoveLiquidityForm";

export function PoolDetailPage() {
  const { pairAddress } = useParams();
  const pool = enabledPools.find((candidate) => candidate.pair === pairAddress);
  const reserves = usePoolReserves(pool);

  if (!pool) {
    return <section className="panel-page"><h2>Pool not found</h2><p className="empty-state">This pair is not enabled in the strict Juno registry.</p><Link to="/pools">Back to pools</Link></section>;
  }

  return (
    <section className="panel-page">
      <p className="eyebrow">Pool detail</p>
      <h2>{pool.label}</h2>
      <p className="risk-copy">Experimental pool: verify every denom and pair address before providing or removing liquidity.</p>
      <div className="contract-strip"><span>Pair</span><code>{pool.pair}</code><button type="button" onClick={() => navigator.clipboard?.writeText(pool.pair)}>Copy</button><ExplorerLink href={pool.explorer}>Mintscan</ExplorerLink></div>
      <div className="contract-strip"><span>LP denom</span><code>{pool.lpToken}</code><button type="button" onClick={() => navigator.clipboard?.writeText(pool.lpToken)}>Copy</button></div>
      {reserves.isError ? <p className="error-text">Live reserve query failed: {reserves.error instanceof Error ? reserves.error.message : String(reserves.error)}</p> : null}
      <div className="metrics-grid">
        <div className="metric-card"><span>Pool type</span><strong>{pool.type.toUpperCase()}</strong><code>{pool.feeBps} bps fee</code></div>
        {pool.assets.map((asset, index) => (
          <div className="metric-card" key={asset.id}>
            <span>{asset.symbol} reserve</span>
            <strong>{reserves.data ? formatAmount(reserves.data.assets[index]?.amount, asset.decimals) : "—"}</strong>
            <code>{asset.id}</code>
          </div>
        ))}
        <div className="metric-card"><span>Total share</span><strong>{reserves.data ? formatAmount(reserves.data.total_share, 6) : "—"}</strong><code>{pool.lpToken}</code></div>
        <div className="metric-card"><span>Query status</span><strong>{reserves.isFetching ? "Refreshing" : reserves.data ? "Live" : "Unavailable"}</strong><code>{reserves.data ? new Date().toLocaleTimeString() : "RPC degraded or not queried"}</code></div>
      </div>
      <LpPositionPanel pool={pool} compact />
      <div className="liquidity-grid">
        <AddLiquidityForm pool={pool} />
        <RemoveLiquidityForm pool={pool} />
      </div>
    </section>
  );
}
