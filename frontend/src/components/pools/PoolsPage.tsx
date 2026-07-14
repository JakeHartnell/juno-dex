import { Link } from "react-router-dom";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { OptionalDataState, Skeleton } from "../common";
import { PoolTable } from "./PoolTable";

export function PoolsPage() {
  const { pools, discovery } = useDexRegistry();
  return (
    <section className="panel-page pools-page">
      <header className="pools-page-header">
        <p className="eyebrow pools-nodes-eyebrow">Liquidity nodes · {pools.length}</p>
        <Link className="pools-provide-link" to="/create">
          <span aria-hidden="true">+</span> Create pool
        </Link>
      </header>
      {discovery.isError ? <OptionalDataState title="Some pools may be missing" onRetry={() => void discovery.refetch()}>Known pools remain available.</OptionalDataState> : null}
      {discovery.isFetching ? <div className="lp-position-skeleton" role="status" aria-label="Refreshing pools"><Skeleton width="14rem" /><Skeleton width="22rem" /></div> : null}
      <PoolTable pools={pools} />
    </section>
  );
}
