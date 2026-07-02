import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { PoolTable } from "./PoolTable";

const mocks = vi.hoisted(() => ({
  metrics: undefined as Record<string, { tvlUsd?: number; volume24hUsd?: number; totalApr?: number; incentivesApr?: number; incentivized?: boolean }> | undefined,
  access: undefined as { source: "indexer" | "mock" | "fallback" | "disabled"; isFallback: boolean; isMock: boolean; isStale: boolean; error?: { code: string; message: string } } | undefined,
}));

vi.mock("../../queries/usePools", () => ({
  usePoolMetrics: () => ({ data: mocks.metrics, access: mocks.access, isError: false }),
  usePoolReserves: () => ({
    isLoading: false,
    isError: false,
    data: { assets: [{ amount: "1000000" }, { amount: "2000000" }], total_share: "1000000" },
    refetch: vi.fn(),
  }),
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
    </MemoryRouter>,
  );
}

describe("PoolTable", () => {
  beforeEach(() => {
    mocks.metrics = undefined;
    mocks.access = undefined;
  });

  it("renders token logos, names, and IBC trace hints", () => {
    renderPoolTable();

    expect(screen.getByAltText("JUNO logo").getAttribute("src")).toBe("https://example.com/JUNO.svg");
    expect(screen.getAllByText("USDC on Juno").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("transfer/channel-1/usdc").length).toBeGreaterThanOrEqual(1);
  });

  it("shows honest unavailable metric copy when no indexer metrics are loaded", () => {
    renderPoolTable();

    expect(screen.getByText(/fall back to pair contract reserve queries without fake USD metrics/i)).toBeTruthy();
    expect(screen.getAllByText(/Metrics unavailable/i).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/On-chain fallback/i).length).toBeGreaterThanOrEqual(3);
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
});
