import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { DexShell } from "../components/layout/DexShell";
import { LiquidityPage } from "../components/liquidity/LiquidityPage";
import { PoolDetailPage } from "../components/pools/PoolDetailPage";
import { PoolsPage } from "../components/pools/PoolsPage";
import { SwapPage } from "../components/swap/SwapPage";

export function App() {
  return (
    <DexShell
      navigation={
        <>
          <NavLink to="/swap">Swap</NavLink>
          <NavLink to="/pools">Pools</NavLink>
          <NavLink to="/liquidity">Liquidity</NavLink>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<Navigate to="/swap" replace />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/pools" element={<PoolsPage />} />
        <Route path="/pools/:pairAddress" element={<PoolDetailPage />} />
        <Route path="/liquidity" element={<LiquidityPage />} />
        <Route path="*" element={<Navigate to="/swap" replace />} />
      </Routes>
    </DexShell>
  );
}
