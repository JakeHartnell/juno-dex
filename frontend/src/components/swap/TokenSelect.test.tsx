import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletBalance } from "../../queries/useWalletBalances";
import { matchesTokenSearch, TokenSelect, type TokenSelectorAsset } from "./TokenSelect";

const assets: TokenSelectorAsset[] = [
  { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6, logoURI: "https://example.com/juno.svg", verified: true },
  { kind: "ibc", id: "ibc/atomhash", symbol: "ATOM", decimals: 6, denomTrace: "transfer/channel-1/uatom", verified: true },
  { kind: "cw20", id: "juno1tokencontract", symbol: "RAW", decimals: 6, verified: false },
];

const balances: WalletBalance[] = [
  { denom: "ujuno", symbol: "JUNO", decimals: 6, amount: "1234567", source: "registry", isKnownDenom: true },
  { denom: "ibc/atomhash", symbol: "ATOM", decimals: 6, amount: "2500000", source: "registry", isKnownDenom: true },
];

describe("TokenSelect", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("filters tokens by symbol, denom trace, and address", () => {
    expect(matchesTokenSearch(assets[1], "atom")).toBe(true);
    expect(matchesTokenSearch(assets[1], "channel-1")).toBe(true);
    expect(matchesTokenSearch(assets[2], "tokencontract")).toBe(true);
    expect(matchesTokenSearch(assets[0], "osmosis")).toBe(false);
  });

  it("searches the modal result list", () => {
    render(<TokenSelect assets={assets} value="ujuno" onChange={vi.fn()} label="Asset" balances={balances} />);

    fireEvent.click(screen.getByRole("button", { name: /juno/i }));
    fireEvent.change(screen.getByLabelText(/search tokens/i), { target: { value: "atom" } });

    expect(screen.getAllByRole("button", { name: /atom/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /raw/i })).toBeNull();
  });

  it("persists favorites to localStorage and ranks them first when reopened", () => {
    render(<TokenSelect assets={assets} value="ujuno" onChange={vi.fn()} label="Asset" balances={balances} />);

    fireEvent.click(screen.getByRole("button", { name: /juno/i }));
    fireEvent.click(screen.getByLabelText(/add atom favorite/i));
    expect(JSON.parse(window.localStorage.getItem("juno-dex.token-selector.favorites") ?? "[]")).toEqual(["ibc/atomhash"]);
    fireEvent.click(screen.getByLabelText(/close modal/i));

    fireEvent.click(screen.getByRole("button", { name: /juno/i }));
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getAllByRole("button", { name: /atom/i }).length).toBeGreaterThan(0);
  });

  it("focuses the search field, closes with Escape, and returns focus to the trigger", () => {
    render(<TokenSelect assets={assets} value="ujuno" onChange={vi.fn()} label="Asset" balances={balances} />);

    const trigger = screen.getByRole("button", { name: /asset: juno/i });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog", { name: /select asset token/i })).toBeTruthy();
    const search = screen.getByLabelText(/search tokens/i);
    expect(document.activeElement).toBe(search);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("displays formatted wallet balances and unverified risk badges", () => {
    render(<TokenSelect assets={assets} value="ujuno" onChange={vi.fn()} label="Asset" balances={balances} />);

    fireEvent.click(screen.getByRole("button", { name: /juno/i }));

    expect(screen.getByText("1.234567")).toBeTruthy();
    expect(screen.getByText("2.5")).toBeTruthy();
    expect(screen.getAllByText(/unverified/i).length).toBeGreaterThan(0);
  });
});
