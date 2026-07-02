import { Navigate, Route, Routes } from "react-router-dom";
import { CreatePoolPage } from "../components/create/CreatePoolPage";
import { LiquidityPage } from "../components/liquidity/LiquidityPage";
import { PoolDetailPage } from "../components/pools/PoolDetailPage";
import { PoolsPage } from "../components/pools/PoolsPage";
import { PortfolioPage } from "../components/portfolio/PortfolioPage";
import { StatsDashboardPage } from "../components/stats/StatsDashboardPage";
import { SwapPage } from "../components/swap/SwapPage";

export const navigationItems = [
  { to: "/stats", label: "Stats" },
  { to: "/swap", label: "Swap" },
  { to: "/pools", label: "Pools" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/create", label: "Create" },
] as const;

function LegacyLiquidityPage() {
  return <LiquidityPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/swap" replace />} />
      <Route path="/stats" element={<StatsDashboardPage />} />
      <Route path="/swap" element={<SwapPage />} />
      <Route path="/pools" element={<PoolsPage />} />
      <Route path="/pools/:pairAddress" element={<PoolDetailPage />} />
      <Route path="/portfolio" element={<PortfolioPage />} />
      <Route path="/liquidity" element={<LegacyLiquidityPage />} />
      <Route path="/create" element={<CreatePoolPage />} />
      <Route path="*" element={<Navigate to="/swap" replace />} />
    </Routes>
  );
}
