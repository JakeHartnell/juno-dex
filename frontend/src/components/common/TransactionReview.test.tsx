import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransactionReview } from "./TransactionReview";

describe("TransactionReview", () => {
  it("shows commitment, account, network, fee availability, and technical disclosure before confirmation", () => {
    const confirm = vi.fn();
    render(
      <TransactionReview
        open
        title="Review swap"
        description="Amounts marked estimated may change; the minimum is enforced."
        account="juno1wallet"
        chainId="juno-1"
        rows={[
          { label: "You send · fixed", value: "1 JUNO" },
          { label: "Minimum received · enforced", value: "0.98 USDC" },
          { label: "Price impact · estimated", value: "0.2%" },
        ]}
        networkFeeEstimate={{ amountBase: "9750", amountJuno: "0.00975", gasUsed: 100_000, gasLimit: 130_000, gasPrice: 0.075 }}
        disclosures={[{ label: "Pair contract", value: "juno1pair" }]}
        onClose={vi.fn()}
        onConfirm={confirm}
      />,
    );

    expect(screen.getByText("juno1wallet")).toBeTruthy();
    expect(screen.getByText("juno-1")).toBeTruthy();
    expect(screen.getByText(/≈ 0.00975 JUNO/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/contracts and identifiers/i));
    expect(screen.getByText("juno1pair")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /confirm in wallet/i }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("prevents confirmation when the reviewed snapshot is invalid", () => {
    render(<TransactionReview open title="Review" description="Changed" rows={[]} confirmDisabled onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: /confirm in wallet/i }).hasAttribute("disabled")).toBe(true);
  });
});
