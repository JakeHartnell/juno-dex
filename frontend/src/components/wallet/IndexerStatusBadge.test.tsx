import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndexerStatusBadge } from "./IndexerStatusBadge";

function renderBadge() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><IndexerStatusBadge /></QueryClientProvider>);
}

describe("IndexerStatusBadge", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("labels an unconfigured indexer without implying health", () => {
    vi.stubEnv("VITE_DEX_INDEXER_URL", "");
    renderBadge();
    expect(screen.getByText("Indexer not configured")).toBeTruthy();
  });

  it("renders no chrome at all when the indexer is healthy", async () => {
    vi.stubEnv("VITE_DEX_INDEXER_URL", "https://indexer.invalid");
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "ok", service: "indexer", dataSource: "indexer", isMock: false }) } as Response);
    const { container } = renderBadge();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("surfaces an unreachable indexer", async () => {
    vi.stubEnv("VITE_DEX_INDEXER_URL", "https://indexer.invalid");
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));
    renderBadge();
    await waitFor(() => expect(screen.getByText("Indexer unavailable")).toBeTruthy(), { timeout: 5_000 });
  });

  it("labels mock-backed health as preview data", async () => {
    vi.stubEnv("VITE_DEX_INDEXER_URL", "https://indexer.invalid");
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "ok", service: "indexer", dataSource: "mock", isMock: true }) } as Response);
    renderBadge();
    await waitFor(() => expect(screen.getByText("Preview data")).toBeTruthy());
  });
});
