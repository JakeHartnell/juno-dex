import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { SwapForm } from "./SwapForm";

const mocks = vi.hoisted(() => ({
  wallet: {
    wallet: { status: "connected", address: "juno1wallet", signer: vi.fn() } as {
      status: "idle" | "connected";
      address?: string;
      signer?: unknown;
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
  balancesLoading: false,
  routeReserves: {} as Record<string, { assets: Array<{ amount: string }>; total_share: string }>,
  quote: {} as any,
  refreshQuote: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => mocks.wallet,
  useNetworkGuard: () => mocks.network,
}));

vi.mock("../../queries/useWalletBalances", () => ({
  useWalletBalances: () => ({ data: mocks.balancesLoading ? undefined : mocks.balances, isError: false, isFetching: mocks.balancesLoading }),
  getWalletBalanceAmount: (balances: typeof mocks.balances | undefined, denom: string) => balances?.find((balance) => balance.denom === denom)?.amount,
}));

vi.mock("../../queries/useSwapQuote", () => ({
  useSwapQuote: () => mocks.quote,
}));

vi.mock("../../queries/usePools", () => ({
  useRouteReserves: () => mocks.routeReserves,
  usePoolCandles: () => ({
    data: [],
    access: { source: "indexer", isFallback: false, isMock: false, isStale: false },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../../settings/SlippageSettingsContext", () => ({
  useSlippageSettings: () => ({ slippageBps: 50, formattedSlippagePercent: "0.5", maxSpread: "0.005" }),
}));

vi.mock("../../mutations/useSwapTx", () => ({
  buildSwapExecuteInstruction: () => ({ contractAddress: "juno1pair", msg: {} }),
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
    { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6, verified: true },
    { kind: "ibc", id: "ibc/test", symbol: "TEST", decimals: 6, verified: true },
  ],
  explorer: "https://ping.pub/juno/address/juno1pair",
  enabled: true,
  status: "active",
  verified: true,
  source: "registry",
};

const atomPool: RegistryPool = {
  ...pool,
  id: "atom",
  label: "TEST / ATOM",
  pair: "juno1pairatom",
  lpToken: "factory/juno1pairatom/lp",
  assets: [
    { kind: "ibc", id: "ibc/test", symbol: "TEST", decimals: 6, verified: true },
    { kind: "ibc", id: "ibc/atom", symbol: "ATOM", decimals: 6, verified: true },
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

function enterOneJuno() {
  fireEvent.change(screen.getByRole("textbox", { name: /you send amount/i }), { target: { value: "1" } });
}

describe("SwapForm", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.wallet.connect.mockReset();
    mocks.network.switchToJuno.mockReset();
    mocks.balancesLoading = false;
    mocks.wallet.wallet = { status: "connected", address: "juno1wallet", signer: vi.fn() };
    mocks.network.network = {
      expectedChainId: "juno-1",
      connectedChainId: "juno-1",
      isWalletConnected: true,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
    };
    mocks.balances = [{ denom: "ujuno", amount: "2000000" }];
    mocks.routeReserves = {};
    mocks.quote = {
      data: { offer_amount: "1000000", return_amount: "990000", spread_amount: "1000", commission_amount: "3000", source: "pair", route: directRoute() },
      isSuccess: true,
      isFetching: false,
      isError: false,
      error: null,
      isDebouncing: false,
      isExpired: false,
      quoteUpdatedAt: 1_000,
      expiresInMs: 20_000,
      refreshQuote: mocks.refreshQuote,
    };
    mocks.refreshQuote.mockReset();
    mocks.refreshQuote.mockImplementation(async () => ({ data: mocks.quote.data, dataUpdatedAt: 1_000, isError: false }));
  });

  it("reviews and submits a direct pair swap with the bounded amount", async () => {
    render(<SwapForm pool={pool} />);
    enterOneJuno();

    const button = screen.getByRole("button", { name: /review swap/i });
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));

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

  it("requires router impact acknowledgement before review and submission", async () => {
    mocks.quote.data = { offer_amount: "1000000", return_amount: "970000", spread_amount: "0", commission_amount: "0", source: "router", route: routerRoute() };
    render(<SwapForm pool={pool} pools={[pool, atomPool]} />);
    enterOneJuno();

    expect(screen.getByRole("button", { name: /acknowledge unavailable price impact/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(/price impact is unavailable for this multi-hop route/i));
    fireEvent.click(screen.getByRole("button", { name: /review swap/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));

    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      route: routerRoute(),
      source: "router",
      minimumReceive: "965150",
    }));
    expect(screen.getByText(/price impact is unavailable for this multi-hop route/i)).toBeTruthy();
  });

  it("connects from the primary action without discarding intent", () => {
    mocks.wallet.wallet = { status: "idle" };
    render(<SwapForm pool={pool} />);
    const button = screen.getByRole("button", { name: /connect wallet to swap/i });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(mocks.wallet.connect).toHaveBeenCalledOnce();
  });

  it("switches network from the primary action", () => {
    mocks.network.network = { ...mocks.network.network, connectedChainId: "osmosis-1", isWrongNetwork: true, isJunoReady: false };
    render(<SwapForm pool={pool} />);
    const button = screen.getByRole("button", { name: /switch to juno to swap/i });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(mocks.network.switchToJuno).toHaveBeenCalledOnce();
  });

  it("disables swap for insufficient balance", () => {
    mocks.balances = [{ denom: "ujuno", amount: "999999" }];
    render(<SwapForm pool={pool} />);
    enterOneJuno();
    expect(screen.getByRole("button", { name: /insufficient juno balance/i }).hasAttribute("disabled")).toBe(true);
  });

  it("blocks execution while the offer balance is unknown", () => {
    mocks.balancesLoading = true;
    render(<SwapForm pool={pool} />);
    enterOneJuno();
    expect(screen.getByRole("button", { name: /loading wallet balance/i }).hasAttribute("disabled")).toBe(true);
  });

  it("disables swap while the current route preview is unavailable", () => {
    mocks.quote = { ...mocks.quote, data: undefined, isSuccess: false, isFetching: false, isError: true, error: new Error("quote failed") };
    render(<SwapForm pool={pool} />);
    enterOneJuno();
    expect(screen.getByRole("button", { name: /route preview unavailable/i }).hasAttribute("disabled")).toBe(true);
  });

  it("requires explicit confirmation for high-impact direct quotes", () => {
    mocks.quote = {
      ...mocks.quote,
      data: { offer_amount: "1000000", return_amount: "900000", spread_amount: "100000", commission_amount: "3000", source: "pair", route: directRoute() },
    };

    render(<SwapForm pool={pool} />);
    enterOneJuno();
    expect(screen.getByRole("button", { name: /acknowledge high price impact/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(/i understand this quote has high price impact/i));
    expect(screen.getByRole("button", { name: /review swap/i }).hasAttribute("disabled")).toBe(false);
  });

  it("hard-blocks extreme price impact", () => {
    mocks.quote = {
      ...mocks.quote,
      data: { offer_amount: "1000000", return_amount: "500000", spread_amount: "500000", commission_amount: "3000", source: "pair", route: directRoute() },
    };

    render(<SwapForm pool={pool} />);
    enterOneJuno();
    expect(screen.getByRole("button", { name: /price impact too high/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/exceeds the 15% safety limit/i);
  });

  it("blocks unverified routes until the user acknowledges risk", () => {
    const unverifiedPool: RegistryPool = { ...pool, source: "factory", verified: false };
    mocks.quote.data = {
      offer_amount: "1000000",
      return_amount: "990000",
      spread_amount: "1000",
      commission_amount: "3000",
      source: "pair",
      route: {
        id: "unverified-direct",
        hops: [{ pool: unverifiedPool, offerAsset: unverifiedPool.assets[0], askAsset: unverifiedPool.assets[1] }],
        operations: [],
      },
    };

    render(<SwapForm pool={unverifiedPool} />);
    enterOneJuno();
    expect(screen.getByRole("button", { name: /acknowledge unverified route/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText(/i understand this swap route uses unverified or risky assets/i));
    expect(screen.getByRole("button", { name: /review swap/i }).hasAttribute("disabled")).toBe(false);
  });

  it("blocks an expired quote", () => {
    mocks.quote = { ...mocks.quote, isExpired: true, expiresInMs: 0 };
    render(<SwapForm pool={pool} />);
    enterOneJuno();
    expect(screen.getByRole("button", { name: /quote expired/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getAllByText(/expired — refresh required/i).length).toBeGreaterThan(0);
  });

  it("describes reverse simulation as a target, not guaranteed exact output", () => {
    render(<SwapForm pool={pool} />);
    const receiveInput = screen.getByRole("textbox", { name: /you receive amount/i });
    fireEvent.change(receiveInput, { target: { value: "2" } });
    expect(screen.getByText(/target output is an estimate, not a guarantee/i)).toBeTruthy();
    expect(screen.queryByText(/swap exact output/i)).toBeNull();
  });

  it("invalidates review when the reviewed quote version changes", async () => {
    const view = render(<SwapForm pool={pool} />);
    enterOneJuno();
    fireEvent.click(screen.getByRole("button", { name: /review swap/i }));
    expect(await screen.findByRole("button", { name: /confirm in wallet/i })).toBeTruthy();

    mocks.quote = { ...mocks.quote, quoteUpdatedAt: 2_000 };
    view.rerender(<SwapForm pool={pool} />);
    expect(screen.getByRole("button", { name: /confirm in wallet/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/quote version changed/i);
  });

  it("closes review when route selection changes", async () => {
    const view = render(<SwapForm pool={pool} />);
    enterOneJuno();
    fireEvent.click(screen.getByRole("button", { name: /review swap/i }));
    expect(await screen.findByRole("button", { name: /confirm in wallet/i })).toBeTruthy();

    mocks.quote = {
      ...mocks.quote,
      data: { ...mocks.quote.data, route: { ...directRoute(), id: "changed-route" } },
    };
    view.rerender(<SwapForm pool={pool} />);
    expect(screen.queryByRole("button", { name: /confirm in wallet/i })).toBeNull();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("starts without transaction intent and reserves JUNO for gas on MAX", () => {
    render(<SwapForm pool={pool} />);
    const input = screen.getByRole("textbox", { name: /you send amount/i }) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByText(/sell exact/i)).toBeTruthy();
    expect(screen.getAllByText(/verified · juno native/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /max/i }));
    expect(input.value).toBe("1.75");
    expect(screen.getByText(/reserves 0.25 juno for network fees/i)).toBeTruthy();
  });

  it("keeps the last quote visible but subdued while a replacement loads", () => {
    mocks.quote = { ...mocks.quote, isFetching: true };
    render(<SwapForm pool={pool} />);

    const quote = screen.getByText(/quote status/i).closest("section");
    expect(quote?.className).toContain("quote-card-updating");
    expect(quote?.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(/expires in/i)).toBeTruthy();
  });

  it("feeds live route reserves into visible liquidity risk", () => {
    mocks.routeReserves = {
      [pool.pair]: { assets: [{ amount: "999999" }, { amount: "1000000" }], total_share: "1000000" },
    };
    render(<SwapForm pool={pool} />);

    expect(screen.getByText("Thin liquidity")).toBeTruthy();
  });

  it("closes settings with Escape and returns focus to the trigger", () => {
    render(<SwapForm pool={pool} />);
    const trigger = screen.getByRole("button", { name: /slippage 0.5%/i });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: /dex settings/i })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /dex settings/i })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
