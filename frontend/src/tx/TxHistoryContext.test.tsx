import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { TransactionCenter } from "../components/tx/TransactionCenter";
import { TX_HISTORY_STORAGE_KEY, TxHistoryProvider, useTxHistory } from "./TxHistoryContext";

function AddRecord() {
  const { upsert } = useTxHistory();
  return <button type="button" onClick={() => upsert({ id: "tx-1", title: "Swap", status: "confirmed", description: "1 JUNO swapped", txHash: "ABC", updatedAt: 10 })}>Add transaction</button>;
}

describe("TxHistoryProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists recent transactions and restores their explorer path after remount", () => {
    const first = render(<TxHistoryProvider><AddRecord /><TransactionCenter /></TxHistoryProvider>);
    fireEvent.click(screen.getByRole("button", { name: /add transaction/i }));
    expect(JSON.parse(window.localStorage.getItem(TX_HISTORY_STORAGE_KEY) ?? "[]")).toHaveLength(1);
    first.unmount();

    render(<TxHistoryProvider><TransactionCenter /></TxHistoryProvider>);
    expect(screen.getByText("1 JUNO swapped")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view in explorer/i }).getAttribute("href")).toContain("/tx/ABC");
  });

  it("restores an in-flight status after its originating route unmounts", () => {
    window.localStorage.setItem(TX_HISTORY_STORAGE_KEY, JSON.stringify([{ id: "pending", title: "Add liquidity", status: "awaiting-signature", description: "Confirm in wallet", updatedAt: 20 }]));
    render(<TxHistoryProvider><TransactionCenter /></TxHistoryProvider>);
    expect(screen.getByText("Add liquidity")).toBeTruthy();
    expect(screen.getByText("awaiting signature")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });
});
