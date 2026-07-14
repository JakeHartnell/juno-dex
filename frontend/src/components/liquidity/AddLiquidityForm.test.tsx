import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { AddLiquidityForm } from "./AddLiquidityForm";

const mocks = vi.hoisted(() => ({
  wallet: {
    wallet: { status: "connected", address: "juno1wallet", signer: vi.fn() } as { status: "idle" | "connected"; address?: string; signer?: unknown },
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
  refetch: vi.fn(),
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
  usePoolReserves: () => ({ data: mocks.poolData, refetch: mocks.refetch }),
}));

vi.mock("../../settings/SlippageSettingsContext", () => ({
  useSlippageSettings: () => ({ slippageBps: 50, formattedSlippagePercent: "0.5", maxSpread: "0.005" }),
}));

vi.mock("../../mutations/useProvideLiquidityTx", () => ({
  buildProvideLiquidityExecuteInstruction: () => ({ contractAddress: "juno1pair", msg: {} }),
  useProvideLiquidityTx: () => ({ mutate: mocks.mutate, isPending: false, isError: false, isSuccess: false, txState: { status: "idle", label: "Ready" } }),
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

describe("AddLiquidityForm", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.refetch.mockReset();
    mocks.poolData = {
      assets: [{ amount: "1000000" }, { amount: "2000000" }],
      total_share: "1000000",
    };
    mocks.wallet.wallet = { status: "connected", address: "juno1wallet", signer: vi.fn() };
    mocks.network.network = {
      expectedChainId: "juno-1",
      connectedChainId: "juno-1",
      isWalletConnected: true,
      isRecovering: false,
      isWrongNetwork: false,
      isJunoReady: true,
    };
    mocks.refetch.mockImplementation(async () => ({ data: mocks.poolData }));
  });

  it("auto-balances, reviews fresh reserves, and submits proportional add liquidity", async () => {
    const { container } = render(<AddLiquidityForm pool={pool} />);

    fireEvent.change(screen.getByLabelText("JUNO amount · driving ratio amount"), { target: { value: "0.1" } });

    expect((screen.getByLabelText("TEST amount · auto-balanced amount") as HTMLInputElement).value).toBe("0.2");
    expect(container.textContent).toContain("Expected LP tokens: 0.1");

    fireEvent.click(screen.getByRole("button", { name: /^review add liquidity$/i }));
    expect(mocks.refetch).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));

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

  it("disables CW20 liquidity deposits until exact allowances are implemented", () => {
    const cw20Pool: RegistryPool = {
      ...pool,
      assets: [pool.assets[0], { kind: "cw20", id: "juno1cw20token000000000000000000000000000000000", symbol: "CW20", decimals: 6, verified: true }],
    };
    render(<AddLiquidityForm pool={cw20Pool} />);
    expect(screen.getByRole("button", { name: /cw20 add liquidity is unavailable/i }).hasAttribute("disabled")).toBe(true);
  });

  it("detects an empty XYK pool and shows first-provider guardrails", () => {
    mocks.poolData = { assets: [{ amount: "0" }, { amount: "0" }], total_share: "0" };

    render(<AddLiquidityForm pool={pool} />);

    expect(screen.getByText("Seed initial liquidity")).toBeTruthy();
    expect(screen.getByText("First-provider warning")).toBeTruthy();
    expect(screen.getByPlaceholderText("SEED")).toBeTruthy();
    expect(screen.getByText(/Initial seeding requires both sides/i)).toBeTruthy();
  });

  it("requires typed acknowledgement and review before first deposit", async () => {
    mocks.poolData = { assets: [{ amount: "0" }, { amount: "0" }], total_share: "0" };
    render(<AddLiquidityForm pool={pool} />);

    fireEvent.change(screen.getByLabelText("JUNO initial amount amount"), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText("TEST initial amount amount"), { target: { value: "0.5" } });

    expect(screen.getByText(/1 JUNO = 5 TEST/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /type seed to acknowledge/i }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("SEED"), { target: { value: "SEED" } });
    fireEvent.click(screen.getByRole("button", { name: /^review initial liquidity$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));

    expect(mocks.mutate).toHaveBeenCalledWith({
      pool,
      amounts: ["100000", "500000"],
      slippageTolerance: "0.005",
      minLpToReceive: undefined,
    });
  });

  it("keeps proportional add-liquidity behavior for non-empty pools", () => {
    render(<AddLiquidityForm pool={pool} />);

    expect(screen.queryByText("First-provider warning")).toBeNull();
    fireEvent.change(screen.getByLabelText("JUNO amount · driving ratio amount"), { target: { value: "0.1" } });

    expect((screen.getByLabelText("TEST amount · auto-balanced amount") as HTMLInputElement).value).toBe("0.2");
    expect(screen.getByRole("button", { name: /^review add liquidity$/i }).hasAttribute("disabled")).toBe(false);
  });
});
