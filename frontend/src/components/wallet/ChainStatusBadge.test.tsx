import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChainStatusBadge } from "./ChainStatusBadge";

function renderBadge(rpcEndpoint = "https://primary.invalid") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChainStatusBadge rpcEndpoint={rpcEndpoint} />
    </QueryClientProvider>,
  );
}

describe("ChainStatusBadge", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("warns when the primary RPC is degraded and a fallback responds", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { sync_info: { latest_block_height: "12345" } } }),
      } as Response);

    renderBadge("https://primary-fallback.invalid");

    await waitFor(() => expect(screen.getByText(/Fallback RPC · Block 12345/i)).toBeTruthy());
    expect(screen.getByText(/Fallback RPC/i).className).toContain("status-warn");
  });

  it("shows degraded when all configured RPC endpoints fail", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

    renderBadge("https://primary-down.invalid");

    await waitFor(() => expect(screen.getByText(/RPC degraded/i)).toBeTruthy(), { timeout: 2_000 });
  });
});
