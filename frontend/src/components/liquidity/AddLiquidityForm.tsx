import type { RegistryPool } from "../../config/registry";

export function AddLiquidityForm({ pool }: { pool: RegistryPool }) {
  return (
    <section className="action-card">
      <h3>Add liquidity</h3>
      <p>Broadcast hook is scaffolded for direct `provide_liquidity`; enable after smoke wallet testing.</p>
      {pool.assets.map((asset) => (
        <label className="field" key={asset.id}>
          <span>{asset.symbol}</span>
          <input placeholder="0.0" disabled />
        </label>
      ))}
      <button type="button" disabled>Preview add liquidity</button>
    </section>
  );
}
