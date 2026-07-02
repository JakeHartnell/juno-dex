import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { LpPositionPanel } from "./LpPositionPanel";

const mocks = vi.hoisted(() => ({
  wallet: { status: "connected" as const, address: "juno1wallet", name: "Juno Wallet" },
  balances: {
    data: [{ denom: "factory/juno1pair/astroport/share", amount: "50000000" }],
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  reserves: {
    data: {
      total_share: "1000000000",
      assets: [
        { info: { native_token: { denom: "ujuno" } }, amount: "5000000000" },
        { info: { native_token: { denom: "factory/pair/token" } }, amount: "10000000000" },
      ],
    },
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
}));

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => ({ wallet: mocks.wallet }),
}));

vi.mock("../../queries/useWalletBalances", () => ({
  resolveDenom: () => ({ denom: pool.lpToken, symbol: "JUNO/TOKEN LP", decimals: 6, source: "lp" }),
  getWalletBalanceAmount: (balances: Array<{ denom: string; amount: string }> | undefined, denom: string) => balances?.find((balance) => balance.denom === denom)?.amount,
  useWalletBalances: () => mocks.balances,
}));

vi.mock("../../queries/usePools", () => ({
  usePoolReserves: () => mocks.reserves,
}));

const pool: RegistryPool = {
  id: "juno-token",
  label: "JUNO / TOKEN",
  pair: "juno1pair",
  lpToken: "factory/juno1pair/astroport/share",
  type: "xyk",
  feeBps: 30,
  enabled: true,
  explorer: "https://mintscan.io/juno/wasm/contract/juno1pair",
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 },
    { kind: "native", id: "factory/pair/token", symbol: "TOKEN", decimals: 6 },
  ],
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <LpPositionPanel pool={pool} />
    </MemoryRouter>,
  );
}

describe("LpPositionPanel", () => {
  it("renders LP balance, share, underlying estimates, and quick actions", () => {
    renderPanel();

    expect(screen.getByText("Position found")).toBeTruthy();
    expect(screen.getByText("50 JUNO/TOKEN LP")).toBeTruthy();
    expect(screen.getByText("5.00%")).toBeTruthy();
    expect(screen.getByText("250 JUNO")).toBeTruthy();
    expect(screen.getByText("500 TOKEN")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add liquidity" }).getAttribute("href")).toBe("/pools/juno1pair");
    expect(screen.getByRole("link", { name: "Remove liquidity" }).getAttribute("href")).toBe("/pools/juno1pair");
    expect((screen.getByRole("button", { name: "Stake soon" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows wallet empty state when disconnected", () => {
    mocks.wallet.status = "disconnected" as never;
    renderPanel();
    expect(screen.getByText("Connect wallet to view LP position")).toBeTruthy();
    mocks.wallet.status = "connected";
  });

  it("shows no-position empty state when LP balance is zero", () => {
    mocks.balances.data = [{ denom: pool.lpToken, amount: "0" }];
    renderPanel();
    expect(screen.getByText("No LP balance for this pool")).toBeTruthy();
    mocks.balances.data = [{ denom: pool.lpToken, amount: "50000000" }];
  });

  it("shows loading and error states", () => {
    mocks.balances.isLoading = true;
    const { rerender } = render(
      <MemoryRouter>
        <LpPositionPanel pool={pool} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Loading LP position")).toBeTruthy();

    mocks.balances.isLoading = false;
    mocks.reserves.isError = true;
    mocks.reserves.error = new Error("RPC unavailable");
    rerender(
      <MemoryRouter>
        <LpPositionPanel pool={pool} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Pool reserves: RPC unavailable");
    mocks.reserves.isError = false;
    mocks.reserves.error = undefined;
  });
});
