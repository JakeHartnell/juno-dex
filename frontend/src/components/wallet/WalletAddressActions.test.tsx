import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WalletAddressActions } from "./WalletAddressActions";

const address = "juno1testwallet000000000000000000000000000000";

describe("WalletAddressActions", () => {
  it("copies with navigator clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    render(<WalletAddressActions address={address} />);
    fireEvent.click(screen.getByRole("button", { name: /copy wallet address/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(address));
    expect(screen.getByText(/copied/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /mintscan/i }).getAttribute("href")).toContain(`/address/${address}`);
  });

  it("falls back to document copy when clipboard is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => true) });
    const execCommand = vi.spyOn(document, "execCommand").mockReturnValue(true);

    render(<WalletAddressActions address={address} />);
    fireEvent.click(screen.getByRole("button", { name: /copy wallet address/i }));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    execCommand.mockRestore();
  });
});
