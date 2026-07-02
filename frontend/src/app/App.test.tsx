import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const walletState = vi.hoisted(() => ({
  wallet: { status: "idle" } as {
    status: "idle" | "connecting" | "connected" | "error";
    address?: string;
    name?: string;
    error?: string;
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  openView: vi.fn(),
}));

vi.mock("../wallet/WalletContext", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
  useWallet: () => walletState,
}));

function renderApp(route = "/liquidity") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App wallet state", () => {
  beforeEach(() => {
    walletState.wallet = { status: "idle" };
    walletState.connect.mockReset();
    walletState.disconnect.mockReset();
    walletState.openView.mockReset();
  });

  it("keeps read-only liquidity copy available without a wallet", () => {
    renderApp();

    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeTruthy();
    expect(screen.getByText(/No wallet connected/i)).toBeTruthy();
  });

  it("opens the cosmos-kit wallet modal from the header", async () => {
    walletState.connect.mockResolvedValue(undefined);
    renderApp();

    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    await waitFor(() => expect(walletState.connect).toHaveBeenCalledTimes(1));
  });

  it("keeps liquidity copy in sync with the connected header wallet", () => {
    walletState.wallet = {
      status: "connected",
      address: "juno1testwallet000000000000000000000000000000",
      name: "QA wallet",
    };

    renderApp();

    expect(screen.getByRole("button", { name: /qa wallet/i })).toBeTruthy();
    expect(screen.queryByText(/No wallet connected/i)).toBeNull();
    expect(screen.getByText(/Connected wallet:/i).textContent).toContain("LP balances are unknown until queried from verified pool denoms.");
  });
});
