import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DataAccessState } from "../../lib/data-access/indexerFallback";
import type { IndexerWalletTransaction } from "../../lib/indexer/types";
import { formatAssetFlow, formatTimestamp, formatUsd, WalletTransactionHistory } from "./WalletTransactionHistory";

const indexedAccess: DataAccessState = { source: "indexer", isFallback: false, isMock: false, isStale: false };
const txs: IndexerWalletTransaction[] = [
  {
    txHash: "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890",
    walletAddress: "juno1wallet",
    poolId: "juno-usdc",
    pairAddress: "juno1pool",
    type: "swap",
    height: 1234567,
    timestamp: "2026-07-02T12:34:00.000Z",
    offerAsset: { denom: "ujuno", symbol: "JUNO", amount: "12.5", valueUsd: 25 },
    askAsset: { denom: "ibc/usdc", symbol: "USDC", amount: "24.9", valueUsd: 24.9 },
    amountUsd: 24.9,
    feeUsd: 0.07,
    success: true,
    dataSource: "indexer",
    isMock: false,
  },
  {
    txHash: "WITHDRAW1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234",
    walletAddress: "juno1wallet",
    poolId: "juno-usdc",
    pairAddress: "juno1pool",
    type: "withdraw_liquidity",
    height: 1234568,
    timestamp: "2026-07-02T13:34:00.000Z",
    offerAsset: { denom: "ujuno", symbol: "JUNO", amount: "1" },
    askAsset: { denom: "ibc/usdc", symbol: "USDC", amount: "2" },
    amountUsd: null,
    feeUsd: null,
    success: true,
    dataSource: "indexer",
    isMock: false,
  },
];

function renderHistory(props: Partial<Parameters<typeof WalletTransactionHistory>[0]> = {}) {
  return render(
    <WalletTransactionHistory
      history={txs}
      access={indexedAccess}
      explorerBaseUrl="https://www.mintscan.io/juno"
      walletConnected
      {...props}
    />,
  );
}

describe("WalletTransactionHistory", () => {
  it("renders indexed wallet history rows with tx links, values, fees, assets, and source markers", () => {
    renderHistory();

    expect(screen.getByRole("heading", { name: "Wallet transaction history" })).toBeTruthy();
    expect(screen.getByText("Swap")).toBeTruthy();
    expect(screen.getByText("Remove liquidity")).toBeTruthy();
    expect(screen.getByText("12.5 JUNO → 24.9 USDC")).toBeTruthy();
    expect(screen.getByText("$24.90")).toBeTruthy();
    expect(screen.getByText("Fee $0.07")).toBeTruthy();
    const link = screen.getByRole("link", { name: /ABCDEF12…567890/i });
    expect(link.getAttribute("href")).toBe(`https://www.mintscan.io/juno/tx/${txs[0].txHash}`);
    expect(screen.getAllByText("indexer").length).toBeGreaterThan(0);
  });

  it("shows an honest empty state when the indexer returns no wallet history", () => {
    renderHistory({ history: [] });

    expect(screen.getByText("No indexed wallet transactions")).toBeTruthy();
    expect(screen.getByText(/No swap, add, withdraw, or claim activity was returned/i)).toBeTruthy();
    expect(screen.getByText(/No fake rows are shown/i)).toBeTruthy();
  });

  it("shows unavailable copy when indexer history falls back after failure", () => {
    renderHistory({ history: [], access: { source: "fallback", isFallback: true, isMock: false, isStale: false, error: { code: "network", message: "Indexer request failed" } } });

    expect(screen.getByText("Wallet history unavailable")).toBeTruthy();
    expect(screen.getByText(/Indexer wallet history unavailable \(Indexer request failed\)/i)).toBeTruthy();
    expect(screen.getByText(/No fallback fabricates transaction rows/i)).toBeTruthy();
  });

  it("filters by transaction type", () => {
    renderHistory();

    fireEvent.click(screen.getByRole("button", { name: "Withdraws" }));

    const table = screen.getByRole("table", { name: "Wallet transaction history" });
    expect(within(table).queryByText("Swap")).toBeNull();
    expect(within(table).getByText("Remove liquidity")).toBeTruthy();
  });

  it("formats transaction values and timestamps without inventing missing data", () => {
    expect(formatUsd(1234.56)).toBe("$1,235");
    expect(formatUsd(null)).toBeUndefined();
    expect(formatAssetFlow(txs[0])).toBe("12.5 JUNO → 24.9 USDC");
    expect(formatTimestamp("not-a-date")).toBe("Time unavailable");
  });
});
