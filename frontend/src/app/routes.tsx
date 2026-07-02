import { Navigate, Route, Routes } from "react-router-dom";
import { LiquidityPage } from "../components/liquidity/LiquidityPage";
import { PoolDetailPage } from "../components/pools/PoolDetailPage";
import { PoolsPage } from "../components/pools/PoolsPage";
import { SwapPage } from "../components/swap/SwapPage";
import { getPoolTypeMetadata, type PoolType } from "../lib/pools/poolTypes";

export const navigationItems = [
  { to: "/swap", label: "Swap" },
  { to: "/pools", label: "Pools" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/create", label: "Create" },
] as const;

function PortfolioPage() {
  return <LiquidityPage />;
}

function CreatePoolPage() {
  const poolTypes: PoolType[] = ["xyk", "stable", "concentrated"];
  return (
    <section className="panel-page scaffold-page" aria-labelledby="create-pool-title">
      <p className="eyebrow">Create pool</p>
      <h2 id="create-pool-title">Pool creation workspace</h2>
      <p>
        Pool creation will use the verified Astroport-Juno factory once the transaction flow is implemented. For now, operators can review the deployment contracts and continue to manage liquidity from verified pools.
      </p>
      <div className="empty-state">
        Pool creation is intentionally scaffolded in the app shell scope. No transaction builder is exposed until the wallet internals and production forms are ready.
      </div>
      <div className="metrics-grid">
        {poolTypes.map((type) => {
          const metadata = getPoolTypeMetadata(type);
          return (
            <div className="metric-card" key={type}>
              <span>Pool type</span>
              <strong>{metadata.label}</strong>
              <code>{type}</code>
              <small>{metadata.createCopy}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/swap" replace />} />
      <Route path="/swap" element={<SwapPage />} />
      <Route path="/pools" element={<PoolsPage />} />
      <Route path="/pools/:pairAddress" element={<PoolDetailPage />} />
      <Route path="/portfolio" element={<PortfolioPage />} />
      <Route path="/liquidity" element={<Navigate to="/portfolio" replace />} />
      <Route path="/create" element={<CreatePoolPage />} />
      <Route path="*" element={<Navigate to="/swap" replace />} />
    </Routes>
  );
}
