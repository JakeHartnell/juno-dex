import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { PoolTable } from "./PoolTable";

const mocks = vi.hoisted(() => ({
  metrics: undefined as Record<string, { tvlUsd?: number | null; tvlJuno?: number | null; volume24hUsd?: number | null; volume24hJuno?: number | null; totalApr?: number; incentivesApr?: number; incentivized?: boolean }> | undefined,
  access: undefined as { source: "indexer" | "mock" | "fallback" | "disabled"; isFallback: boolean; isMock: boolean; isStale: boolean; error?: { code: string; message: string } } | undefined,
  metricRefetch: vi.fn(),
}));

vi.mock("../../queries/usePools", () => ({
  usePoolMetrics: () => ({ data: mocks.metrics, access: mocks.access, isError: false, refetch: mocks.metricRefetch }),
  usePoolReserves: () => ({
    isLoading: false,
    isError: false,
    data: { assets: [{ amount: "1000000" }, { amount: "2000000" }], total_share: "1000000" },
    refetch: vi.fn(),
  }),
  usePoolCandles: () => ({ data: [], access: mocks.access, isLoading: false, isFetching: false, refetch: vi.fn() }),
}));

vi.mock("../../queries/useWalletBalances", async () => {
  const actual = await vi.importActual<typeof import("../../queries/useWalletBalances")>("../../queries/useWalletBalances");
  return {
    ...actual,
    useWalletBalances: () => ({ data: [] }),
  };
});

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => ({ wallet: { status: "idle" } }),
}));

function pool(overrides: Partial<RegistryPool> & Pick<RegistryPool, "id" | "label" | "pair" | "type" | "feeBps">): RegistryPool {
  const [leftRaw, rightRaw] = overrides.label.split("/");
  const left = leftRaw?.trim();
  const right = rightRaw?.trim();
  return {
    lpToken: `${overrides.id}-lp`,
    assets: [
      { kind: "native", id: `${overrides.id}-base`, symbol: left ?? "AAA", name: left, decimals: 6, logoURI: `https://example.com/${left}.svg` },
      { kind: "native", id: `${overrides.id}-quote`, symbol: right ?? "BBB", name: `${right} on Juno`, decimals: 6, logoURI: `https://example.com/${right}.svg`, denomTrace: `transfer/channel-1/${right?.toLowerCase()}` },
    ],
    explorer: `https://example.com/${overrides.pair}`,
    enabled: true,
    verified: true,
    source: "registry",
    notes: "Test pool",
    ...overrides,
    status: overrides.status ?? "active",
  };
}

const pools = [
  pool({ id: "juno-usdc", label: "JUNO / USDC", pair: "juno1alpha", type: "xyk", feeBps: 30 }),
  pool({ id: "atom-usdc", label: "ATOM / USDC", pair: "juno1beta", type: "stable", feeBps: 5, verified: false }),
];

function renderPoolTable() {
  return render(
    <MemoryRouter>
      <PoolTable pools={pools} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

describe("PoolTable", () => {
  beforeEach(() => {
    mocks.metrics = undefined;
    mocks.access = undefined;
    mocks.metricRefetch.mockReset();
  });

  it("renders compact pool identity with token logos and no visible pool tags", () => {
    renderPoolTable();

    expect(screen.getByAltText("JUNO logo").getAttribute("src")).toBe("https://example.com/JUNO.svg");
    expect(screen.getByText("JUNO / USDC")).toBeTruthy();
    const poolRows = screen.getAllByRole("row").slice(1);
    for (const row of poolRows) {
      expect(within(row).queryByText("XYK")).toBeNull();
      expect(within(row).queryByText(/XYK · 30 bps/i)).toBeNull();
      expect(within(row).queryByText(/verified pool/i)).toBeNull();
    }
    expect(screen.queryByText("transfer/channel-1/usdc")).toBeNull();
  });

  it("shows unavailable metric placeholders without pool list banner copy", () => {
    renderPoolTable();

    expect(screen.queryByText(/Browse pools by liquidity, volume, APR, type, and wallet position/i)).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("does not show a retry banner when pool metrics fail", () => {
    mocks.access = { source: "fallback", isFallback: true, isMock: false, isStale: false, error: { code: "timeout", message: "indexer timed out" } };

    renderPoolTable();
    expect(screen.queryByText("Pool metrics unavailable")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(mocks.metricRefetch).not.toHaveBeenCalled();
  });

  it("navigates to pool details when a pool row is clicked", () => {
    renderPoolTable();

    fireEvent.click(screen.getByRole("row", { name: /open JUNO \/ USDC pool details/i }));
    expect(screen.getByTestId("location").textContent).toBe("/pools/juno1alpha");
    expect(screen.queryByRole("link", { name: "Swap" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Details" })).toBeNull();
  });

  it("filters rows by search and verification controls", () => {
    renderPoolTable();

    fireEvent.change(screen.getByLabelText(/search pools/i), { target: { value: "atom" } });
    expect(screen.getByText("ATOM / USDC")).toBeTruthy();
    expect(screen.queryByText("JUNO / USDC")).toBeNull();

    fireEvent.change(screen.getByLabelText(/verification/i), { target: { value: "verified" } });
    expect(screen.getByText(/No pools match these filters/i)).toBeTruthy();
  });

  it("sorts by TVL from indexer metrics", () => {
    mocks.metrics = {
      juno1alpha: { tvlUsd: 10, volume24hUsd: 5, totalApr: 1 },
      juno1beta: { tvlUsd: 500, volume24hUsd: 20, totalApr: 3 },
    };
    mocks.access = { source: "indexer", isFallback: false, isMock: false, isStale: false };
    renderPoolTable();

    fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: "tvl" } });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("ATOM / USDC")).toBeTruthy();
    expect(within(rows[1]).getByText("JUNO / USDC")).toBeTruthy();
    expect(screen.getByText("$500")).toBeTruthy();
    expect(screen.getByText("3%")).toBeTruthy();
  });

  it("exposes visible and programmatic sort direction on sortable columns", () => {
    renderPoolTable();
    const tvlHeader = screen.getByRole("columnheader", { name: /tvl/i });
    expect(tvlHeader.getAttribute("aria-sort")).toBe("none");
    fireEvent.click(within(tvlHeader).getByRole("button"));
    expect(tvlHeader.getAttribute("aria-sort")).toBe("descending");
    expect(within(tvlHeader).getByText("↓")).toBeTruthy();
  });

  it("shows and sorts by Juno metrics when USD metrics are unavailable", () => {
    mocks.metrics = {
      juno1alpha: { tvlUsd: null, tvlJuno: 10, volume24hUsd: null, volume24hJuno: 5 },
      juno1beta: { tvlUsd: null, tvlJuno: 500, volume24hUsd: null, volume24hJuno: 20 },
    };
    mocks.access = { source: "indexer", isFallback: false, isMock: false, isStale: false };
    renderPoolTable();

    fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: "tvl" } });
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("ATOM / USDC")).toBeTruthy();
    expect(screen.getByText("500 JUNO")).toBeTruthy();
    expect(screen.getByText("20 JUNO")).toBeTruthy();
  });
});
