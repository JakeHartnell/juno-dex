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
    data: undefined as { return_amount: string; spread_amount: string; commission_amount: string; source: "pair" | "router"; route: unknown } | undefined,
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

function directRoute() {
  return {
    id: "direct",
    hops: [{ pool, offerAsset: pool.assets[0], askAsset: pool.assets[1] }],
    operations: [{ astro_swap: { offer_asset_info: { native_token: { denom: "ujuno" } }, ask_asset_info: { native_token: { denom: "ibc/test" } } } }],
  };
}

function routerRoute() {
  return {
    id: "router",
    hops: [
      { pool, offerAsset: pool.assets[0], askAsset: pool.assets[1] },
      { pool: atomPool, offerAsset: atomPool.assets[0], askAsset: atomPool.assets[1] },
    ],
    operations: [
      { astro_swap: { offer_asset_info: { native_token: { denom: "ujuno" } }, ask_asset_info: { native_token: { denom: "ibc/test" } } } },
      { astro_swap: { offer_asset_info: { native_token: { denom: "ibc/test" } }, ask_asset_info: { native_token: { denom: "ibc/atom" } } } },
    ],
  };
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
      data: { return_amount: "990000", spread_amount: "1000", commission_amount: "3000", source: "pair", route: directRoute() },
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
      route: directRoute(),
      offerAsset: expect.objectContaining(pool.assets[0]),
      askAsset: expect.objectContaining(pool.assets[1]),
      amount: "1000000",
      maxSpread: "0.005",
      minimumReceive: "985050",
      source: "pair",
    });
  });

  it("submits a router swap when the best quote is a router route", () => {
    mocks.quote.data = { return_amount: "970000", spread_amount: "0", commission_amount: "0", source: "router", route: routerRoute() };
    render(<SwapForm pool={pool} pools={[pool, atomPool]} />);

    fireEvent.click(screen.getByRole("button", { name: /^swap$/i }));

    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      route: routerRoute(),
      source: "router",
      minimumReceive: "965150",
    }));
    expect(screen.getByText(/multi-hop routes touch multiple pools/i)).toBeTruthy();
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

  it("disables swap while the current route preview is unavailable", () => {
    mocks.quote = { data: undefined, isSuccess: false, isFetching: false, isError: true, error: new Error("quote failed") };
    render(<SwapForm pool={pool} />);
    expect(screen.getByRole("button", { name: /route preview unavailable/i }).hasAttribute("disabled")).toBe(true);
  });

  it("requires explicit confirmation for high-impact direct quotes", () => {
    mocks.quote = {
      data: { return_amount: "1000", spread_amount: "1000", commission_amount: "3", source: "pair", route: directRoute() },
      isSuccess: true,
      isFetching: false,
      isError: false,
      error: null,
    };

    render(<SwapForm pool={pool} />);
    expect(screen.getByRole("button", { name: /confirm high price impact/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(/i understand this quote has high price impact/i));
    expect(screen.getByRole("button", { name: /^swap$/i }).hasAttribute("disabled")).toBe(false);
  });
});
