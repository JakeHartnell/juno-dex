import { useDexRegistry } from "../../queries/useDexRegistry";
import { PoolTable } from "./PoolTable";

export function PoolsPage() {
  const { pools } = useDexRegistry();
  return (
    <section className="panel-page">
      <p className="eyebrow">Registry pools</p>
      <h2>Verified Astroport-Juno pools</h2>
      <p>Only enabled XYK pools from the strict local registry are rendered. Placeholder pools fail tests and app startup.</p>
      <PoolTable pools={pools} />
    </section>
  );
}
