import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { ToastProvider } from "../common";
import { RemoveLiquidityForm } from "./RemoveLiquidityForm";

const mocks = vi.hoisted(() => ({
  wallet: {
    status: "connected" as const,
    address: "juno1wallet",
    signer: vi.fn(),
  },
  network: {
    expectedChainId: "juno-1" as const,
    connectedChainId: "juno-1",
    isWalletConnected: true,
    isRecovering: false,
    isWrongNetwork: false,
    isJunoReady: true,
  },
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => ({ wallet: mocks.wallet }),
  useNetworkGuard: () => ({ network: mocks.network, switchToJuno: vi.fn() }),
}));

vi.mock("../../settings/SlippageSettingsContext", () => ({
  useSlippageSettings: () => ({ slippageBps: 50, formattedSlippagePercent: "0.5", maxSpread: "0.005" }),
}));

vi.mock("../../queries/useWalletBalances", () => ({
    resolveDenom: () => ({ denom: pool.lpToken, symbol: "JUNO/TOKEN LP", decimals: 6, source: "lp" }),
    getWalletBalanceAmount: () => "100000000",
    useWalletBalances: () => ({
      data: [{ denom: pool.lpToken, amount: "100000000" }],
      isError: false,
      error: undefined,
    }),
}));

vi.mock("../../queries/usePools", () => ({
  usePoolReserves: () => ({
    data: {
      total_share: "1000000000",
      assets: [
        { info: { native_token: { denom: "ujuno" } }, amount: "5000000000" },
        { info: { native_token: { denom: "factory/pair/token" } }, amount: "10000000000" },
      ],
    },
    isFetching: false,
    isError: false,
    error: undefined,
    refetch: mocks.refetch,
  }),
}));

vi.mock("../../mutations/useWithdrawLiquidityTx", () => ({
  buildWithdrawLiquidityExecuteInstruction: () => ({ contractAddress: "juno1pair", msg: {} }),
  useWithdrawLiquidityTx: () => ({ isPending: false, mutateAsync: mocks.mutateAsync, txState: { status: "idle", label: "Ready" } }),
}));

const pool: RegistryPool = {
  id: "juno-token",
  label: "JUNO / TOKEN",
  pair: "juno1pair",
  lpToken: "factory/juno1pair/astroport/share",
  type: "xyk",
  feeBps: 30,
  enabled: true,
  status: "active",
  verified: true,
  source: "registry",
  explorer: "https://ping.pub/juno/wasm/contract/juno1pair",
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6, verified: true },
    { kind: "native", id: "factory/pair/token", symbol: "TOKEN", decimals: 6, verified: true },
  ],
};

function renderForm() {
  return render(
    <ToastProvider>
      <RemoveLiquidityForm pool={pool} />
    </ToastProvider>,
  );
}

describe("RemoveLiquidityForm", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.refetch.mockReset();
    mocks.refetch.mockResolvedValue({
      data: {
        total_share: "1000000000",
        assets: [
          { info: { native_token: { denom: "ujuno" } }, amount: "5000000000" },
          { info: { native_token: { denom: "factory/pair/token" } }, amount: "10000000000" },
        ],
      },
    });
  });

  it("fills LP amount from quick-fill percentages and updates underlying estimates", () => {
    const { container } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "50%" }));

    expect((screen.getByLabelText("LP amount amount") as HTMLInputElement).value).toBe("50");
    expect(container.textContent).toContain("250 / 248.75 JUNO");
    expect(container.textContent).toContain("500 / 497.5 TOKEN");
    expect((screen.getByRole("button", { name: "Review withdrawal" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("passes LP amount and slippage-protected minimum assets to the withdraw mutation", async () => {
    mocks.mutateAsync.mockResolvedValueOnce({ transactionHash: "ABC123" });
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    fireEvent.click(screen.getByRole("button", { name: "Review withdrawal" }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({
      pool,
      lpAmount: "50000000",
      minAssetsToReceive: [
        { info: { native_token: { denom: "ujuno" } }, amount: "248750000" },
        { info: { native_token: { denom: "factory/pair/token" } }, amount: "497500000" },
      ],
    }));
  });
});
