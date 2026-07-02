import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TxStatusDialog } from "./TxStatusDialog";
import type { TxLifecycleState } from "../../tx/useTxRunner";

const result = {
  transactionHash: "ABC123DEF456",
} as TxLifecycleState["result"];

describe("TxStatusDialog", () => {
  it("renders pending/signing state", () => {
    render(<TxStatusDialog state={{ status: "signing", label: "Awaiting wallet signature", description: "Confirm in wallet" }} />);
    expect(screen.getByText("Transaction status")).toBeTruthy();
    expect(screen.getByText("Awaiting wallet signature")).toBeTruthy();
    expect(screen.getByText("Confirm in wallet")).toBeTruthy();
  });

  it("renders success with tx hash", () => {
    render(<TxStatusDialog state={{ status: "success", label: "Transaction succeeded", result }} />);
    expect(screen.getByText("Transaction succeeded")).toBeTruthy();
    expect(screen.getByText("ABC123DEF456")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /view/i })).toBeNull();
  });

  it("renders failure copy with retry affordance", () => {
    const retry = vi.fn();
    render(<TxStatusDialog status="failed" error={new Error("insufficient funds for fee")} retry={retry} />);
    expect(screen.getByText("Transaction failed")).toBeTruthy();
    expect(screen.getByText("Insufficient funds")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry transaction/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders rejected state without a tx hash", () => {
    render(<TxStatusDialog status="rejected" error="Request rejected by user" />);
    expect(screen.getByText("Rejected in wallet")).toBeTruthy();
    expect(screen.getByText("Transaction rejected")).toBeTruthy();
    expect(screen.queryByText(/Tx hash:/i)).toBeNull();
  });
});
