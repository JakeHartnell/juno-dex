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
    expect(screen.getByText("Not configured")).toBeTruthy();
  });

  it("reports healthy production indexer responses", async () => {
    vi.stubEnv("VITE_DEX_INDEXER_URL", "https://indexer.invalid");
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "ok", service: "indexer", dataSource: "indexer", isMock: false }) } as Response);
    renderBadge();
    await waitFor(() => expect(screen.getByText("Healthy")).toBeTruthy());
  });

  it("labels mock-backed health as preview data", async () => {
    vi.stubEnv("VITE_DEX_INDEXER_URL", "https://indexer.invalid");
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "ok", service: "indexer", dataSource: "mock", isMock: true }) } as Response);
    renderBadge();
    await waitFor(() => expect(screen.getByText("Preview data")).toBeTruthy());
  });
});
