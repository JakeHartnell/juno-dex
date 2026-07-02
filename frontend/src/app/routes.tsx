import { Navigate, Route, Routes } from "react-router-dom";
import { CreatePoolPage } from "../components/create/CreatePoolPage";
import { LiquidityPage } from "../components/liquidity/LiquidityPage";
import { PoolDetailPage } from "../components/pools/PoolDetailPage";
import { PoolsPage } from "../components/pools/PoolsPage";
import { SwapPage } from "../components/swap/SwapPage";

export const navigationItems = [
  { to: "/swap", label: "Swap" },
  { to: "/pools", label: "Pools" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/create", label: "Create" },
] as const;

function PortfolioPage() {
  return <LiquidityPage />;
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
