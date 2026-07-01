import type { RegistryPool } from "../../config/registry";

export function RemoveLiquidityForm({ pool }: { pool: RegistryPool }) {
  return (
    <section className="action-card">
      <h3>Remove liquidity</h3>
      <p>Uses TokenFactory LP denom funds when wallet execution is enabled.</p>
      <label className="field">
        <span>LP amount</span>
        <input placeholder="0" disabled />
      </label>
      <code>{pool.lpToken}</code>
      <button type="button" disabled>Preview withdraw</button>
    </section>
  );
}
