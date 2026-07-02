import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TokenAmountInput } from "./TokenAmountInput";

describe("TokenAmountInput", () => {
  it("emits decimal-safe base amounts", () => {
    const onChange = vi.fn();
    render(<TokenAmountInput label="From" value="" decimals={6} symbol="JUNO" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("From amount"), { target: { value: "0.000001" } });

    expect(onChange).toHaveBeenCalledWith("0.000001", "1");
  });

  it("shows invalid precision errors", () => {
    render(<TokenAmountInput label="From" value="0.0000001" decimals={6} symbol="JUNO" onChange={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("Too many decimal places");
  });

  it("shows over-balance errors", () => {
    render(<TokenAmountInput label="From" value="1.000001" decimals={6} symbol="JUNO" balanceBaseAmount="1000000" onChange={vi.fn()} />);

    expect(screen.getByRole("alert").textContent).toContain("Amount exceeds balance");
  });

  it("fires MAX and half callbacks with base amounts", () => {
    const onChange = vi.fn();
    const onMax = vi.fn();
    const onHalf = vi.fn();
    render(
      <TokenAmountInput
        label="From"
        value=""
        decimals={6}
        symbol="JUNO"
        balanceBaseAmount="1234567"
        onChange={onChange}
        onMax={onMax}
        onHalf={onHalf}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /half/i }));
    expect(onHalf).toHaveBeenCalledWith("617283");
    expect(onChange).toHaveBeenCalledWith("0.617283", "617283");

    fireEvent.click(screen.getByRole("button", { name: /max/i }));
    expect(onMax).toHaveBeenCalledWith("1234567");
    expect(onChange).toHaveBeenCalledWith("1.234567", "1234567");
  });
});
