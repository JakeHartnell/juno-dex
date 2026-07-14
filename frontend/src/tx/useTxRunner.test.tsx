import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ToastProvider } from "../components/common";
import { TxStatusDialog } from "../components/tx/TxStatusDialog";
import { TxHistoryProvider } from "./TxHistoryContext";
import { walletBalancesQueryKey, type WalletBalance } from "../queries/useWalletBalances";
import { applyConfirmedExactBalanceDeltas, useTxRunner } from "./useTxRunner";

function RunnerHarness({ outcome }: { outcome: "confirmed" | "timeout" | "rejected" }) {
  const runner = useTxRunner();
  const run = () => {
    void runner.runTx({
      title: "Test swap",
      variables: {},
      broadcast: async () => {
        if (outcome === "timeout") throw new Error("transaction not found after broadcast timeout");
        if (outcome === "rejected") throw new Error("User rejected the signature request");
        return { transactionHash: "HASH123" };
      },
    }).catch(() => undefined);
  };
  return <><button type="button" onClick={run}>Run</button><TxStatusDialog state={runner.state} /></>;
}

function renderHarness(outcome: "confirmed" | "timeout" | "rejected") {
  return render(<ToastProvider><TxHistoryProvider><RunnerHarness outcome={outcome} /></TxHistoryProvider></ToastProvider>);
}

function DuplicateHarness({ broadcast, onSuccess }: { broadcast: () => Promise<{ transactionHash: string }>; onSuccess?: () => Promise<void> }) {
  const runner = useTxRunner();
  const run = () => { void runner.runTx({ title: "Bounded action", variables: {}, broadcast, onSuccess }).catch(() => undefined); };
  return <><button type="button" onClick={run}>Run bounded action</button><TxStatusDialog state={runner.state} /></>;
}

describe("useTxRunner lifecycle", () => {
  it("ends confirmed transactions with a durable explorer link and refresh action", async () => {
    renderHarness("confirmed");
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Transaction confirmed")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /view transaction in explorer/i })[0]?.getAttribute("href")).toContain("/tx/HASH123");
    expect(screen.getByRole("button", { name: /refresh balances and data/i })).toBeTruthy();
  });

  it("does not offer blind rebroadcast after an ambiguous timeout", async () => {
    renderHarness("timeout");
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByText("Confirmation timed out")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /retry transaction/i })).toBeNull();
    expect(screen.getAllByText(/check recent account activity/i).length).toBeGreaterThan(0);
  });

  it("allows an explicitly rejected wallet request to be prepared again", async () => {
    renderHarness("rejected");
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(screen.getByText("Rejected in wallet")).toBeTruthy());
    expect(screen.getByRole("button", { name: /retry transaction/i })).toBeTruthy();
  });

  it("deduplicates rapid confirmation clicks while a broadcast is in flight", async () => {
    let resolveBroadcast!: (result: { transactionHash: string }) => void;
    const broadcast = vi.fn(() => new Promise<{ transactionHash: string }>((resolve) => { resolveBroadcast = resolve; }));
    render(<ToastProvider><TxHistoryProvider><DuplicateHarness broadcast={broadcast} /></TxHistoryProvider></ToastProvider>);

    const button = screen.getByRole("button", { name: /run bounded action/i });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(broadcast).toHaveBeenCalledTimes(1));
    resolveBroadcast({ transactionHash: "ONE_HASH" });
    await waitFor(() => expect(screen.getByText("Transaction confirmed")).toBeTruthy());
  });

  it("prevents rebroadcast while confirmed data is still reconciling", async () => {
    let finishIndexing!: () => void;
    const onSuccess = vi.fn(() => new Promise<void>((resolve) => { finishIndexing = resolve; }));
    const broadcast = vi.fn().mockResolvedValue({ transactionHash: "INDEX_HASH" });
    render(<ToastProvider><TxHistoryProvider><DuplicateHarness broadcast={broadcast} onSuccess={onSuccess} /></TxHistoryProvider></ToastProvider>);

    const button = screen.getByRole("button", { name: /run bounded action/i });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText("Transaction confirmed")).toBeTruthy());
    fireEvent.click(button);
    expect(broadcast).toHaveBeenCalledTimes(1);
    finishIndexing();
  });
});

describe("confirmed exact balance reconciliation", () => {
  const balance = (denom: string, amount: string): WalletBalance => ({ denom, amount, symbol: denom, decimals: 6, source: "registry", isKnownDenom: true });

  it("updates only existing cached denoms and combines exact deltas", () => {
    const queryClient = new QueryClient();
    const key = walletBalancesQueryKey("juno1wallet");
    queryClient.setQueryData(key, [balance("ibc/usdc", "1000"), balance("ujuno", "5000")]);

    applyConfirmedExactBalanceDeltas(queryClient, "juno1wallet", [
      { denom: "ibc/usdc", amount: "-200" },
      { denom: "ibc/usdc", amount: "50" },
      { denom: "unknown", amount: "999" },
    ]);

    expect(queryClient.getQueryData<WalletBalance[]>(key)?.map(({ denom, amount }) => ({ denom, amount }))).toEqual([
      { denom: "ibc/usdc", amount: "850" },
      { denom: "ujuno", amount: "5000" },
    ]);
  });

  it("never creates a negative display balance and ignores malformed deltas", () => {
    const queryClient = new QueryClient();
    const key = walletBalancesQueryKey("juno1wallet");
    queryClient.setQueryData(key, [balance("factory/token", "10")]);

    applyConfirmedExactBalanceDeltas(queryClient, "juno1wallet", [
      { denom: "factory/token", amount: "-50" },
      { denom: "factory/token", amount: "1.5" },
    ]);

    expect(queryClient.getQueryData<WalletBalance[]>(key)?.[0].amount).toBe("0");
  });
});
