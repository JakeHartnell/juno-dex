import { Link, useParams } from "react-router-dom";
import { enabledPools } from "../../config/registry";
import { formatAmount } from "../../lib/format/amounts";
import { usePoolReserves } from "../../queries/usePools";
import { ExplorerLink } from "../common/ExplorerLink";
import { AddLiquidityForm } from "../liquidity/AddLiquidityForm";
import { RemoveLiquidityForm } from "../liquidity/RemoveLiquidityForm";

export function PoolDetailPage() {
  const { pairAddress } = useParams();
  const pool = enabledPools.find((candidate) => candidate.pair === pairAddress);
  const reserves = usePoolReserves(pool);

  if (!pool) {
    return <section className="panel-page"><h2>Pool not found</h2><Link to="/pools">Back to pools</Link></section>;
  }

  return (
    <section className="panel-page">
      <p className="eyebrow">Pool detail</p>
      <h2>{pool.label}</h2>
      <div className="contract-strip"><span>Pair</span><code>{pool.pair}</code><ExplorerLink href={pool.explorer}>Mintscan</ExplorerLink></div>
      <div className="contract-strip"><span>LP denom</span><code>{pool.lpToken}</code></div>
      {reserves.isError ? <p className="error-text">Live reserve query failed: {reserves.error instanceof Error ? reserves.error.message : String(reserves.error)}</p> : null}
      <div className="metrics-grid">
        {pool.assets.map((asset, index) => (
          <div className="metric-card" key={asset.id}>
            <span>{asset.symbol} reserve</span>
            <strong>{reserves.data ? formatAmount(reserves.data.assets[index]?.amount, asset.decimals) : "—"}</strong>
            <code>{asset.id}</code>
          </div>
        ))}
        <div className="metric-card"><span>Total share</span><strong>{reserves.data ? formatAmount(reserves.data.total_share, 6) : "—"}</strong><code>{pool.lpToken}</code></div>
      </div>
      <div className="liquidity-grid">
        <AddLiquidityForm pool={pool} />
        <RemoveLiquidityForm pool={pool} />
      </div>
    </section>
  );
}
