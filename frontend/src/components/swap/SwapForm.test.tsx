import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { SwapForm } from "./SwapForm";

const mocks = vi.hoisted(() => ({
  wallet: {
    wallet: { status: "connected", address: "juno1wallet", getSigningCosmWasmClient: vi.fn() } as {
      status: "idle" | "connected";
      address?: string;
      signer?: unknown;
      getSigningCosmWasmClient?: () => Promise<unknown>;
    },
    connect: vi.fn(),
  },
  network: {
    network: {
      expectedChainId: "juno-1" as const,
      connectedChainId: "juno-1",
      isWalletConnected: true,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
    },
    switchToJuno: vi.fn(),
  },
  balances: [{ denom: "ujuno", amount: "2000000" }],
  quote: {
    data: { return_amount: "990000", spread_amount: "1000", commission_amount: "3000" } as { return_amount: string; spread_amount: string; commission_amount: string } | undefined,
    isSuccess: true,
    isFetching: false,
    isError: false,
    error: null as Error | null,
  },
  mutate: vi.fn(),
}));

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => mocks.wallet,
  useNetworkGuard: () => mocks.network,
}));

vi.mock("../../queries/useWalletBalances", () => ({
  useWalletBalances: () => ({ data: mocks.balances, isError: false, isFetching: false }),
  getWalletBalanceAmount: (balances: typeof mocks.balances, denom: string) => balances.find((balance) => balance.denom === denom)?.amount,
}));

vi.mock("../../queries/useSwapQuote", () => ({
  useSwapQuote: () => mocks.quote,
}));

vi.mock("../../settings/SlippageSettingsContext", () => ({
  useSlippageSettings: () => ({ slippageBps: 50, formattedSlippagePercent: "0.5", maxSpread: "0.005" }),
}));

vi.mock("../../mutations/useSwapTx", () => ({
  useSwapTx: () => ({ mutate: mocks.mutate, isPending: false, isError: false, isSuccess: false, txState: { status: "idle", label: "Ready" } }),
}));

const pool: RegistryPool = {
  id: "test",
  label: "JUNO / TEST",
  pair: "juno1pair",
  lpToken: "factory/juno1pair/lp",
  type: "xyk",
  feeBps: 30,
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 },
    { kind: "ibc", id: "ibc/test", symbol: "TEST", decimals: 6 },
  ],
  explorer: "https://www.mintscan.io/juno/address/juno1pair",
  enabled: true,
};

const atomPool: RegistryPool = {
  ...pool,
  id: "atom",
  label: "TEST / ATOM",
  pair: "juno1pairatom",
  lpToken: "factory/juno1pairatom/lp",
  assets: [
    { kind: "ibc", id: "ibc/test", symbol: "TEST", decimals: 6 },
    { kind: "ibc", id: "ibc/atom", symbol: "ATOM", decimals: 6 },
  ],
};

function swapButton() {
  return screen.getByRole("button", { name: /swap|connect wallet|switch to juno|quote unavailable|refreshing quote|insufficient|confirm high price impact|no direct pool route|choose two different tokens/i });
}

describe("SwapForm", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.wallet.wallet = { status: "connected", address: "juno1wallet", getSigningCosmWasmClient: vi.fn() };
    mocks.network.network = {
      expectedChainId: "juno-1",
      connectedChainId: "juno-1",
      isWalletConnected: true,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
    };
    mocks.balances = [{ denom: "ujuno", amount: "2000000" }];
    mocks.quote = {
      data: { return_amount: "990000", spread_amount: "1000", commission_amount: "3000" },
      isSuccess: true,
      isFetching: false,
      isError: false,
      error: null,
    };
  });

  it("submits a direct pair swap with the current amount and max spread", () => {
    render(<SwapForm pool={pool} />);

    const button = screen.getByRole("button", { name: /^swap$/i });
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);

    expect(mocks.mutate).toHaveBeenCalledWith({
      pool,
      offerAsset: expect.objectContaining(pool.assets[0]),
      askAsset: expect.objectContaining(pool.assets[1]),
      amount: "1000000",
      maxSpread: "0.005",
    });
  });

  it("disables swap without a connected wallet", () => {
    mocks.wallet.wallet = { status: "idle" };

    render(<SwapForm pool={pool} />);

    expect(screen.getByRole("button", { name: /connect wallet to swap/i }).hasAttribute("disabled")).toBe(true);
  });

  it("disables swap on the wrong network", () => {
    mocks.network.network = { ...mocks.network.network, connectedChainId: "osmosis-1", isWrongNetwork: true, isJunoReady: false };

    render(<SwapForm pool={pool} />);

    expect(screen.getByRole("button", { name: /switch to juno to swap/i }).hasAttribute("disabled")).toBe(true);
  });

  it("disables swap for insufficient balance", () => {
    mocks.balances = [{ denom: "ujuno", amount: "999999" }];

    render(<SwapForm pool={pool} />);

    expect(screen.getByRole("button", { name: /insufficient juno balance/i }).hasAttribute("disabled")).toBe(true);
  });

  it("disables swap while the current quote is unavailable", () => {
    mocks.quote = { data: undefined, isSuccess: false, isFetching: false, isError: true, error: new Error("quote failed") };

    render(<SwapForm pool={pool} />);

    expect(screen.getByRole("button", { name: /quote unavailable/i }).hasAttribute("disabled")).toBe(true);
  });

  it("requires explicit confirmation for high-impact quotes", () => {
    mocks.quote = {
      data: { return_amount: "1000", spread_amount: "1000", commission_amount: "3" },
      isSuccess: true,
      isFetching: false,
      isError: false,
      error: null,
    };

    render(<SwapForm pool={pool} />);

    expect(screen.getByRole("button", { name: /confirm high price impact/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(/i understand this quote has high price impact/i));
    const button = screen.getByRole("button", { name: /^swap$/i });
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("disables swaps when the selected tokens do not have a direct supported route", () => {
    render(<SwapForm pool={pool} pools={[pool, atomPool]} />);

    fireEvent.click(screen.getByRole("button", { name: /test ibc\/test/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /atom/i }).at(-1)!);

    expect(screen.getByText(/no supported direct pool route/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /no direct pool route for juno → atom/i }).hasAttribute("disabled")).toBe(true);
  });
});
