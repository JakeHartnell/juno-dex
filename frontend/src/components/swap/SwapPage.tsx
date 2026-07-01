import { useDexRegistry } from "../../queries/useDexRegistry";
import { ExplorerLink } from "../common/ExplorerLink";
import { RiskNotice } from "../common/RiskNotice";
import { SwapForm } from "./SwapForm";

export function SwapPage() {
  const { pools, registry } = useDexRegistry();
  const pool = pools[0];

  return (
    <section className="page-grid">
      <div className="hero-panel">
        <p className="eyebrow">Juno utility terminal</p>
        <h2>Swap verified Astroport-Juno XYK pools.</h2>
        <p>Strict registry, live pair simulation, visible denoms, visible contracts. No charts, no yield cosplay, no hidden launch assumptions.</p>
        <div className="contract-strip">
          <span>Factory</span><code>{registry.factory}</code>
          <ExplorerLink href={`${registry.explorerBaseUrl}/wasm/contract/${registry.factory}`}>Mintscan</ExplorerLink>
        </div>
      </div>
      <div>
        <RiskNotice />
        {pool ? <SwapForm pool={pool} /> : <p>No enabled pools in registry.</p>}
      </div>
    </section>
  );
}
