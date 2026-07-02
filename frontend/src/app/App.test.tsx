import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const signer = {} as ReturnType<NonNullable<Window["keplr"]>["getOfflineSigner"]>;

describe("App wallet state", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.keplr;
  });

  it("keeps liquidity copy in sync with the connected header wallet", async () => {
    window.keplr = {
      enable: vi.fn().mockResolvedValue(undefined),
      experimentalSuggestChain: vi.fn().mockResolvedValue(undefined),
      getKey: vi.fn().mockResolvedValue({ bech32Address: "juno1testwallet000000000000000000000000000000", name: "QA wallet" }),
      getOfflineSigner: vi.fn().mockReturnValue(signer),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/liquidity"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /connect keplr/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /qa wallet/i })).toBeTruthy());

    expect(screen.queryByText(/No wallet connected/i)).toBeNull();
    expect(screen.getByText(/Connected wallet:/i).textContent).toContain("LP balances are unknown until queried from verified pool denoms.");
  });
});
