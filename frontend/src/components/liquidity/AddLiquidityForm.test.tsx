import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { AddLiquidityForm } from "./AddLiquidityForm";

const mocks = vi.hoisted(() => ({
  wallet: {
    wallet: { status: "connected", address: "juno1wallet" } as { status: "idle" | "connected"; address?: string; getSigningCosmWasmClient?: () => Promise<unknown> },
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
  balances: [
    { denom: "ujuno", amount: "1000000" },
    { denom: "ibc/test", amount: "2000000" },
  ],
  poolData: {
    assets: [{ amount: "1000000" }, { amount: "2000000" }],
    total_share: "1000000",
  },
  mutate: vi.fn(),
}));

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => mocks.wallet,
  useNetworkGuard: () => mocks.network,
}));

vi.mock("../../queries/useWalletBalances", () => ({
  useWalletBalances: () => ({ data: mocks.balances }),
  getWalletBalanceAmount: (balances: typeof mocks.balances, denom: string) => balances.find((balance) => balance.denom === denom)?.amount,
}));

vi.mock("../../queries/usePools", () => ({
  usePoolReserves: () => ({ data: mocks.poolData }),
}));

vi.mock("../../settings/SlippageSettingsContext", () => ({
  useSlippageSettings: () => ({ slippageBps: 50, formattedSlippagePercent: "0.5", maxSpread: "0.005" }),
}));

vi.mock("../../mutations/useProvideLiquidityTx", () => ({
  useProvideLiquidityTx: () => ({ mutate: mocks.mutate, isPending: false, isError: false, isSuccess: false }),
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

describe("AddLiquidityForm", () => {
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
  });

  it("auto-balances the second asset and submits proportional add liquidity", () => {
    const { container } = render(<AddLiquidityForm pool={pool} />);

    fireEvent.change(screen.getByLabelText("JUNO amount · driving ratio amount"), { target: { value: "0.1" } });

    expect((screen.getByLabelText("TEST amount · auto-balanced amount") as HTMLInputElement).value).toBe("0.2");
    expect(container.textContent).toContain("Expected LP tokens: 0.1");

    fireEvent.click(screen.getByRole("button", { name: /^add liquidity$/i }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      pool,
      amounts: ["100000", "200000"],
      slippageTolerance: "0.005",
      minLpToReceive: "99500",
    });
  });

  it("blocks submission on the wrong network", () => {
    mocks.network.network = { ...mocks.network.network, connectedChainId: "osmosis-1", isWrongNetwork: true, isJunoReady: false };

    render(<AddLiquidityForm pool={pool} />);

    expect(screen.getByRole("button", { name: /switch to juno to add liquidity/i }).hasAttribute("disabled")).toBe(true);
  });

  it("disables stable and PCL add liquidity until type-specific provide math is wired", () => {
    render(<AddLiquidityForm pool={{ ...pool, type: "concentrated" }} />);

    expect(screen.getByText(/PCL deposits disabled/i)).toBeTruthy();
    expect(screen.getAllByText(/PCL provide rules depend on concentration parameters/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: /PCL add liquidity is not supported in the UI yet/i }).hasAttribute("disabled")).toBe(true);
  });
});
