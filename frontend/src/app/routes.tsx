import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const CreatePoolPage = lazy(() => import("../components/create/CreatePoolPage").then((module) => ({ default: module.CreatePoolPage })));
const LiquidityPage = lazy(() => import("../components/liquidity/LiquidityPage").then((module) => ({ default: module.LiquidityPage })));
const PoolDetailPage = lazy(() => import("../components/pools/PoolDetailPage").then((module) => ({ default: module.PoolDetailPage })));
const PoolsPage = lazy(() => import("../components/pools/PoolsPage").then((module) => ({ default: module.PoolsPage })));
const PortfolioPage = lazy(() => import("../components/portfolio/PortfolioPage").then((module) => ({ default: module.PortfolioPage })));
const SwapPage = lazy(() => import("../components/swap/SwapPage").then((module) => ({ default: module.SwapPage })));

export const navigationItems = [
  { to: "/swap", label: "Swap" },
  { to: "/pools", label: "Pools" },
] as const;

export const walletNavigationItems = [
  { to: "/portfolio", label: "Portfolio" },
] as const;

function LegacyLiquidityPage() {
  return <LiquidityPage />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<main className="app-main" aria-busy="true"><div className="state-card"><strong>Loading route…</strong><p>Preparing the Juno DEX experience.</p></div></main>}>
      <Routes>
        <Route path="/" element={<Navigate to="/swap" replace />} />
        <Route path="/stats" element={<Navigate to="/pools" replace />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/pools" element={<PoolsPage />} />
        <Route path="/pools/:pairAddress" element={<PoolDetailPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/liquidity" element={<LegacyLiquidityPage />} />
        <Route path="/create" element={<CreatePoolPage />} />
        <Route path="*" element={<Navigate to="/swap" replace />} />
      </Routes>
    </Suspense>
  );
}
