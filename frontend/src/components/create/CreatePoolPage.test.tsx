import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreatePoolPage } from "./CreatePoolPage";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  configRefetch: vi.fn(),
  duplicateRefetch: vi.fn(),
  config: {
    pair_configs: [
      { code_id: 1, pair_type: { xyk: {} }, total_fee_bps: 30, maker_fee_bps: 10, permissioned: false },
    ],
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (options: { queryKey: string[] }) => options.queryKey[0] === "factory-config"
      ? { data: mocks.config, isLoading: false, isError: false, refetch: mocks.configRefetch }
      : { data: null, isLoading: false, isFetching: false, isError: false, refetch: mocks.duplicateRefetch },
  };
});

vi.mock("../../queries/useDexRegistry", () => ({ useDexRegistry: () => ({ pools: [] }) }));
vi.mock("../../wallet/WalletContext", () => ({
  useWallet: () => ({ wallet: { status: "connected", address: "juno1wallet", signer: vi.fn() } }),
  useNetworkGuard: () => ({ network: { expectedChainId: "juno-1", connectedChainId: "juno-1", isJunoReady: true, isWrongNetwork: false } }),
}));
vi.mock("../../mutations/useCreatePoolTx", () => ({
  buildCreatePoolExecuteInstruction: () => ({ contractAddress: "juno1factory", msg: {} }),
  useCreatePoolTx: () => ({ mutate: mocks.mutate, isPending: false, isError: false, isSuccess: false, txState: { status: "idle", label: "Ready" } }),
}));

describe("CreatePoolPage review", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.configRefetch.mockReset();
    mocks.duplicateRefetch.mockReset();
    mocks.configRefetch.mockResolvedValue({ data: mocks.config, isError: false });
    mocks.duplicateRefetch.mockResolvedValue({ data: null, isError: false });
  });

  it("rechecks factory state and reviews the empty-pool commitment before wallet confirmation", async () => {
    render(<MemoryRouter><CreatePoolPage /></MemoryRouter>);

    const reviewButton = await screen.findByRole("button", { name: /review pool creation/i });
    fireEvent.click(reviewButton);

    await waitFor(() => expect(mocks.configRefetch).toHaveBeenCalledOnce());
    expect(mocks.duplicateRefetch).toHaveBeenCalledOnce();
    expect(await screen.findByText(/creates an empty pool only/i)).toBeTruthy();
    expect(screen.getByText(/none — separate transaction required/i)).toBeTruthy();
    fireEvent.click(screen.getByText(/contracts and identifiers/i));
    expect(screen.getByText(/pool creation contract/i)).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: /confirm in wallet/i }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ option: expect.objectContaining({ id: "xyk" }) }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
