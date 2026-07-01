import { Link } from "react-router-dom";
import type { RegistryPool } from "../../config/registry";
import { truncateAddress } from "../../lib/format/addresses";

export function PoolTable({ pools }: { pools: RegistryPool[] }) {
  return (
    <div className="pool-table">
      {pools.map((pool) => (
        <Link className="pool-row" to={`/pools/${pool.pair}`} key={pool.id}>
          <div>
            <strong>{pool.label}</strong>
            <p>{pool.notes}</p>
          </div>
          <span>{pool.type.toUpperCase()}</span>
          <code>{truncateAddress(pool.pair)}</code>
        </Link>
      ))}
    </div>
  );
}
