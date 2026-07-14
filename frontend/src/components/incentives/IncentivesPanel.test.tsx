import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import type { IncentivesPoolState } from "../../lib/incentives";
import { ToastProvider } from "../common";
import { IncentivesPanel } from "./IncentivesPanel";

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
  incentives: {
    data: {
      configured: true,
      contractAddress: "juno1incentives",
      lpToken: "factory/juno1pair/astroport/share",
      stakedAmount: "50000000",
      pendingRewards: [{ info: { native_token: { denom: "ujuno" } }, amount: "1230000" }],
      rewardInfo: [{ index: "0", orphaned: "0", rps: "0.25", reward: { ext: { info: { native_token: { denom: "factory/reward" } }, next_update_ts: 10 } } }],
    } as IncentivesPoolState,
    isLoading: false,
    isError: false,
  } as any,
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => ({ wallet: mocks.wallet }),
  useNetworkGuard: () => ({ network: mocks.network, switchToJuno: vi.fn() }),
}));

vi.mock("../../queries/useWalletBalances", () => ({
  resolveDenom: () => ({ denom: pool.lpToken, symbol: "JUNO/TOKEN LP", decimals: 6, source: "lp" }),
  getWalletBalanceAmount: () => "100000000",
  useWalletBalances: () => ({ data: [{ denom: pool.lpToken, amount: "100000000" }], isError: false }),
}));

vi.mock("../../queries/useIncentives", () => ({
  useIncentivesPool: () => mocks.incentives,
}));

vi.mock("../../mutations/useIncentivesTx", () => ({
  buildIncentivesExecuteInstruction: () => ({ contractAddress: "juno1incentives", msg: {} }),
  useIncentivesTx: () => ({ isPending: false, mutateAsync: mocks.mutateAsync, txState: { status: "idle", label: "Ready" } }),
}));

function renderPanel() {
  return render(
    <ToastProvider>
      <IncentivesPanel pool={pool} metrics={{ incentivesApr: 12.5, incentivized: true }} />
    </ToastProvider>,
  );
}

describe("IncentivesPanel", () => {
  beforeEach(() => {
    mocks.wallet.status = "connected";
    mocks.network.isWrongNetwork = false;
    mocks.network.isJunoReady = true;
    mocks.mutateAsync.mockReset();
    mocks.refetch.mockReset();
    mocks.incentives.data = {
      configured: true,
      contractAddress: "juno1incentives",
      lpToken: pool.lpToken,
      stakedAmount: "50000000",
      pendingRewards: [{ info: { native_token: { denom: "ujuno" } }, amount: "1230000" }],
      rewardInfo: [{ index: "0", orphaned: "0", rps: "0.25", reward: { ext: { info: { native_token: { denom: "factory/reward" } }, next_update_ts: 10 } } }],
    };
    mocks.incentives.refetch = mocks.refetch;
    mocks.refetch.mockImplementation(async () => ({ data: mocks.incentives.data }));
  });

  it("shows configured incentives, APR, staked LP, pending rewards, and external programs", () => {
    renderPanel();

    expect(screen.getByText("12.5% estimated")).toBeTruthy();
    expect(screen.getAllByText(/50 JUNO\/TOKEN LP/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1.23 ujuno/)).toBeTruthy();
    expect(screen.getByText(/External factory\/reward/)).toBeTruthy();
  });

  it("shows safe empty copy when incentives are unconfigured", () => {
    mocks.incentives.data = { configured: false, lpToken: pool.lpToken, pendingRewards: [], rewardInfo: [] } as IncentivesPoolState;
    renderPanel();

    expect(screen.getByText(/No incentives contract is configured/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stake LP" })).toBeNull();
  });

  it("validates stake amount and submits the tx mutation payload", async () => {
    mocks.mutateAsync.mockResolvedValueOnce({ transactionHash: "ABC" });
    renderPanel();

    fireEvent.change(screen.getByLabelText("Stake LP amount"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Review stake" }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ action: "stake", pool, amount: "25000000" }));
  });

  it("validates unstake amount and submits claim rewards", async () => {
    mocks.mutateAsync.mockResolvedValue({ transactionHash: "DEF" });
    renderPanel();

    fireEvent.change(screen.getByLabelText("Unstake LP amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Review unstake" }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: "Review claim" }));
    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ action: "unstake", pool, amount: "10000000" }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ action: "claim", pool, amount: undefined }));
  });
});
