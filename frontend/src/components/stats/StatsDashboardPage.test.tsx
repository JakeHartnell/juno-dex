import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { DataAccessState } from "../../lib/data-access/indexerFallback";
import { formatPercent, formatUsdCompact, sortTopPools, type StatsDashboardData } from "../../lib/stats/dashboard";
import { StatsDashboardView } from "./StatsDashboardPage";

const indexedAccess: DataAccessState = {
  source: "indexer",
  isFallback: false,
  isMock: false,
  isStale: false,
  updatedAt: "2026-07-02T12:00:00.000Z",
};

function renderDashboard(data: StatsDashboardData, access: DataAccessState | undefined = indexedAccess) {
  return render(
    <MemoryRouter>
      <StatsDashboardView data={data} access={access} />
    </MemoryRouter>,
  );
}

describe("StatsDashboardView", () => {
  it("renders protocol stats and top pools from indexer data", () => {
    renderDashboard({
      stats: { poolCount: 2, tvlUsd: 1_250_000, volume24hUsd: 42_500, fees24hUsd: 127.5, incentivizedPools: 1, source: "indexer" },
      topPools: [{ id: "juno-usdc", label: "JUNO / USDC", pair: "juno1pool", tvlUsd: 1_250_000, volume24hUsd: 42_500, totalApr: 12.345, source: "indexer" }],
    });

    expect(screen.getByRole("heading", { name: /juno dex stats/i })).toBeTruthy();
    expect(screen.getAllByText("$1.3M").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$42,500.0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("$127.50")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("JUNO / USDC")).toBeTruthy();
    expect(screen.getByText("12.35%")).toBeTruthy();
    expect(screen.getByRole("link", { name: /go to swap/i }).getAttribute("href")).toBe("/swap");
  });

  it("shows honest unavailable copy when indexer data is disabled or empty", () => {
    renderDashboard({ topPools: [] }, {
      source: "disabled",
      isFallback: true,
      isMock: false,
      isStale: false,
      error: { code: "disabled", message: "Indexer URL is not configured" },
    });

    expect(screen.getByText(/protocol analytics are not configured/i)).toBeTruthy();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/top pools unavailable/i)).toBeTruthy();
  });

  it("renders Juno-denominated stats when USD pricing is unavailable", () => {
    renderDashboard({
      stats: { poolCount: 2, tvlJuno: 1_250_000, volume24hJuno: 42_500, fees24hJuno: 127.5, incentivizedPools: 1, source: "indexer" },
      topPools: [{ id: "juno-usdc", label: "JUNO / USDC", pair: "juno1pool", tvlJuno: 1_250_000, volume24hJuno: 42_500, source: "indexer" }],
    });

    expect(screen.getAllByText("1.3M JUNO").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("42,500 JUNO").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("127.5 JUNO")).toBeTruthy();
  });

  it("uses neutral copy for preview sources", () => {
    renderDashboard({
      stats: { poolCount: 1, tvlUsd: 10, source: "mock", isMock: true, isStale: true, updatedAt: "2026-07-02T12:00:00.000Z" },
      topPools: [{ id: "mock", label: "Mock Pool", pair: "juno1mock", tvlUsd: 10, source: "mock", isMock: true, isStale: true, updatedAt: "2026-07-02T12:00:00.000Z" }],
    }, {
      source: "mock",
      isFallback: false,
      isMock: true,
      isStale: true,
      updatedAt: "2026-07-02T12:00:00.000Z",
    });

    expect(screen.queryByText(/mock indexer data/i)).toBeNull();
    expect(screen.getByText(/Updated Jul 2, 2026/i)).toBeTruthy();
  });

  it("formats top pool metrics and sorts numeric leaders before unavailable pools", () => {
    expect(formatUsdCompact(1_500_000)).toBe("$1.5M");
    expect(formatPercent(7.123)).toBe("7.12%");
    expect(sortTopPools([
      { id: "empty", label: "Empty", pair: "juno1empty" },
      { id: "leader", label: "Leader", pair: "juno1leader", tvlUsd: 100 },
      { id: "volume", label: "Volume", pair: "juno1volume", volume24hUsd: 50 },
    ]).map((pool) => pool.id)).toEqual(["leader", "volume", "empty"]);
  });
});
