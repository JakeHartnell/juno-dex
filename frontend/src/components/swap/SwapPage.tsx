import { useDexRegistry } from "../../queries/useDexRegistry";
import { ExplorerLink } from "../common/ExplorerLink";
import { RiskNotice } from "../common/RiskNotice";
import { SwapForm } from "./SwapForm";

export function SwapPage() {
  const { pools, registry } = useDexRegistry();
  const pool = pools[0];

  return (
    <section className="swap-page-grid">
      <div className="swap-primary">
        <RiskNotice variant="compact" />
        {pool ? <SwapForm pool={pool} /> : <p className="empty-state">No enabled verified pools. Add a real Juno pair to the strict registry before exposing swaps.</p>}
      </div>
      <div className="hero-panel context-panel">
        <p className="eyebrow">Juno utility terminal</p>
        <h2>Verified Juno deployment</h2>
        <p>Strict registry, live pair simulation, visible denoms, visible contracts. This is an experimental thin-liquidity tool, not a launch-market dashboard.</p>
        <div className="contract-strip">
          <span>Factory</span><code>{registry.factory}</code>
          <ExplorerLink href={`${registry.explorerBaseUrl}/wasm/contract/${registry.factory}`}>Mintscan</ExplorerLink>
        </div>
        {pool ? (
          <div className="contract-strip">
            <span>Direct pair</span><code>{pool.pair}</code>
            <ExplorerLink href={pool.explorer}>Mintscan</ExplorerLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}
