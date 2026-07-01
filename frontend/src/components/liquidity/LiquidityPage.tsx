import { Link } from "react-router-dom";
import { enabledPools } from "../../config/registry";

export function LiquidityPage() {
  return (
    <section className="panel-page">
      <p className="eyebrow">Liquidity</p>
      <h2>Wallet LP overview</h2>
      <p>V1 does not assume an indexer. Pick a verified pool to inspect reserves and use the add/remove liquidity skeleton.</p>
      <div className="pool-table">
        {enabledPools.map((pool) => <Link className="pool-row" to={`/pools/${pool.pair}`} key={pool.id}>{pool.label}<code>{pool.lpToken}</code></Link>)}
      </div>
    </section>
  );
}
