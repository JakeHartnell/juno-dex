import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/common";
import { App } from "./App";

const walletState = vi.hoisted(() => ({
  wallet: { status: "idle" } as {
    status: "idle" | "connecting" | "connected" | "error";
    address?: string;
    name?: string;
    error?: string;
    chainId?: string;
  },
  network: {
    expectedChainId: "juno-1" as const,
    connectedChainId: undefined as string | undefined,
    isWalletConnected: false,
    isRecovering: false,
    isWrongNetwork: false,
    isJunoReady: true,
    message: undefined as string | undefined,
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  openView: vi.fn(),
  switchToJuno: vi.fn(),
}));

vi.mock("../wallet/WalletContext", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
  useWallet: () => walletState,
  useNetworkGuard: () => ({ network: walletState.network, switchToJuno: walletState.switchToJuno }),
}));

const testPair = "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv";

function renderApp(route = "/liquidity") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App wallet state", () => {
  beforeEach(() => {
    walletState.wallet = { status: "idle" };
    walletState.network = {
      expectedChainId: "juno-1",
      connectedChainId: undefined,
      isWalletConnected: false,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
      message: undefined,
    };
    walletState.connect.mockReset();
    walletState.disconnect.mockReset();
    walletState.openView.mockReset();
    walletState.switchToJuno.mockReset();
  });

  it("keeps read-only liquidity copy available without a wallet", () => {
    renderApp();

    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeTruthy();
    expect(screen.getByText(/No wallet connected/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
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
      chainId: "juno-1",
    };
    walletState.network = {
      expectedChainId: "juno-1",
      connectedChainId: "juno-1",
      isWalletConnected: true,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
      message: undefined,
    };

    renderApp();

    expect(screen.getAllByText(/QA wallet/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /disconnect/i })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /mintscan/i })[0].getAttribute("href")).toContain("/address/juno1testwallet");
    expect(screen.queryByText(/No wallet connected/i)).toBeNull();
    expect(screen.getByText(/Connected wallet:/i).textContent).toContain("LP balances, shares, and underlying estimates refresh every 30 seconds");
  });

  it("offers wrong-network recovery and blocks liquidity actions", async () => {
    walletState.wallet = {
      status: "connected",
      address: "osmo1wrongwallet0000000000000000000000000000",
      name: "QA wallet",
      chainId: "osmosis-1",
    };
    walletState.network = {
      expectedChainId: "juno-1",
      connectedChainId: "osmosis-1",
      isWalletConnected: true,
      isRecovering: false,
      isWrongNetwork: true,
      isJunoReady: false,
      message: "Wallet is connected to osmosis-1. Switch to Juno (juno-1) before broadcasting transactions.",
    };
    walletState.switchToJuno.mockResolvedValue(undefined);

    renderApp(`/pools/${testPair}`);

    expect(screen.getByRole("alert").textContent).toContain("Switch to Juno (juno-1)");
    expect(screen.getByRole("button", { name: /^switch to juno$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /switch to juno to add liquidity/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText(/transactions are blocked off-network/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^switch to juno$/i }));
    await waitFor(() => expect(walletState.switchToJuno).toHaveBeenCalledTimes(1));
  });

  it("offers recovery when Juno is not enabled but preserves read-only mode", () => {
    walletState.wallet = { status: "error", error: "Chain juno-1 is not enabled" };
    walletState.network = {
      expectedChainId: "juno-1",
      connectedChainId: undefined,
      isWalletConnected: false,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
      message: "Juno (juno-1) is not enabled in this wallet yet. Switch to Juno to continue.",
    };

    renderApp();

    expect(screen.getByText(/No wallet connected/i)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("not enabled");
    expect(screen.getByRole("button", { name: /^switch to juno$/i })).toBeTruthy();
  });
});
