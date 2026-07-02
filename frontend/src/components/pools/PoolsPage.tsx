import { useDexRegistry } from "../../queries/useDexRegistry";
import { ErrorState, Skeleton } from "../common";
import { PoolTable } from "./PoolTable";

export function PoolsPage() {
  const { pools, discovery } = useDexRegistry();
  return (
    <section className="panel-page">
      <p className="eyebrow">Factory pools</p>
      <h2>Juno pools</h2>
      <p>Browse available pools, compare liquidity and volume, and manage positions.</p>
      {discovery.isError ? <ErrorState title="Factory discovery unavailable" error="Showing curated registry fallback only; no fake factory rows are injected." onRetry={() => void discovery.refetch()} /> : null}
      {discovery.isFetching ? <div className="lp-position-skeleton" aria-label="Refreshing factory pairs"><Skeleton width="14rem" /><Skeleton width="22rem" /></div> : null}
      <PoolTable pools={pools} />
    </section>
  );
}
