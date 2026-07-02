import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { PoolDetailPage } from "./PoolDetailPage";

const mocks = vi.hoisted(() => ({
  metrics: undefined as Record<string, { tvlUsd?: number; volume24hUsd?: number; feeApr?: number; incentivesApr?: number; totalApr?: number; incentivized?: boolean }> | undefined,
  access: undefined as { source: "indexer" | "mock" | "fallback" | "disabled"; isFallback: boolean; isMock: boolean; isStale: boolean; error?: { code: string; message: string } } | undefined,
  reserves: {
    isLoading: false,
    isFetching: false,
    isError: false,
    error: undefined as unknown,
    data: { assets: [{ amount: "100000000" }, { amount: "250000000" }], total_share: "50000000" },
    refetch: vi.fn(),
  },
}));

const pool: RegistryPool = {
  id: "juno-usdc",
  label: "JUNO / USDC",
  pair: "juno1pooldetail",
  lpToken: "factory/juno1pooldetail/astroport/share",
  type: "xyk",
  feeBps: 30,
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", name: "Juno", decimals: 6, logoURI: "https://example.com/juno.svg", verified: true },
    { kind: "ibc", id: "ibc/usdc", symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: "https://example.com/usdc.svg", denomTrace: "transfer/channel-42/uusdc", verified: true },
  ],
  explorer: "https://www.mintscan.io/juno/wasm/contract/juno1pooldetail",
  enabled: true,
  verified: true,
  source: "registry",
  notes: "Test pool",
};

vi.mock("../../queries/useDexRegistry", () => ({
  useDexRegistry: () => ({
    registry: { explorerBaseUrl: "https://www.mintscan.io/juno" },
    pools: [pool],
    discovery: { isError: false },
  }),
}));

vi.mock("../../queries/usePools", () => ({
  usePoolMetrics: () => ({ data: mocks.metrics, access: mocks.access, isError: false }),
  usePoolReserves: () => mocks.reserves,
  useWalletIndexerData: () => ({ data: { positions: [], history: [] }, access: mocks.access, isLoading: false }),
}));

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => ({ wallet: { status: "connected", address: "juno1wallet", name: "Test wallet" } }),
}));

vi.mock("../liquidity/AddLiquidityForm", () => ({
  AddLiquidityForm: () => <div>Add liquidity form</div>,
}));

vi.mock("../liquidity/RemoveLiquidityForm", () => ({
  RemoveLiquidityForm: () => <div>Remove liquidity form</div>,
}));

vi.mock("../liquidity/LpPositionPanel", () => ({
  LpPositionPanel: () => <section>LP position panel</section>,
}));

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/pools/${pool.pair}`]}>
      <Routes>
        <Route path="/pools/:pairAddress" element={<PoolDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PoolDetailPage", () => {
  beforeEach(() => {
    mocks.metrics = undefined;
    mocks.access = undefined;
    mocks.reserves = {
      isLoading: false,
      isFetching: false,
      isError: false,
      error: undefined,
      data: { assets: [{ amount: "100000000" }, { amount: "250000000" }], total_share: "50000000" },
      refetch: vi.fn(),
    };
  });

  it("renders per-pool analytics, reserves, composition, actions, and status", () => {
    mocks.metrics = {
      [pool.pair]: { tvlUsd: 125000, volume24hUsd: 42000, feeApr: 4.5, incentivesApr: 1.25, totalApr: 5.75, incentivized: true },
    };
    mocks.access = { source: "indexer", isFallback: false, isMock: false, isStale: false };

    renderDetail();

    expect(screen.getByRole("heading", { name: "JUNO / USDC" })).toBeTruthy();
    expect(screen.getByText("$125,000")).toBeTruthy();
    expect(screen.getByText("$42,000")).toBeTruthy();
    expect(screen.getByText("5.75%")).toBeTruthy();
    expect(screen.getAllByText(/XYK/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/30 bps fee tier/i)).toBeTruthy();
    expect(screen.getAllByText("50").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Live reserves")).toBeTruthy();
    expect(screen.getByText(/100 JUNO/i)).toBeTruthy();
    expect(screen.getByText(/250 USDC/i)).toBeTruthy();
    expect(screen.getByText(/28.57% of token units/i)).toBeTruthy();
    expect(screen.getByText(/1 JUNO ≈ 2.5 USDC/i)).toBeTruthy();
    expect(screen.getByText(/Your pool share = wallet LP balance ÷ total LP shares/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /swap/i }).getAttribute("href")).toBe("/swap");
    expect(screen.getByRole("link", { name: /add liquidity/i }).getAttribute("href")).toBe("#add-liquidity");
    expect(screen.getByRole("link", { name: /remove liquidity/i }).getAttribute("href")).toBe("#remove-liquidity");
    expect(screen.getAllByRole("link", { name: /mintscan/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("shows honest unavailable-metrics copy without fake TVL, volume, APR, charts, or transactions", () => {
    renderDetail();

    const analytics = screen.getByLabelText("Pool analytics cards");
    expect(within(analytics).getAllByText("Metrics unavailable").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/TVL, 24h volume, and APR are unavailable from/i)).toBeTruthy();
    expect(screen.getByText(/Price charts depend on the pool indexer\/charting service/i)).toBeTruthy();
    expect(screen.getByText(/No swap, add, withdraw, or claim activity was returned/i)).toBeTruthy();
    expect(screen.getByText(/USD value, volume, and APR require external pricing\/indexer data/i)).toBeTruthy();
  });
});
