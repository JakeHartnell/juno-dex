import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { RegistryPool } from "../../config/registry";
import { PoolTable } from "./PoolTable";

vi.mock("../../queries/usePools", () => ({
  usePoolReserves: () => ({
    isLoading: false,
    isError: false,
    data: { assets: [{ amount: "1000000" }, { amount: "2000000" }], total_share: "1000000" },
  }),
}));

const pool: RegistryPool = {
  id: "metadata-pool",
  label: "JUNO / ATOM",
  pair: "juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv",
  lpToken: "factory/juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv/astroport/share",
  type: "xyk",
  feeBps: 30,
  explorer: "https://www.mintscan.io/juno/wasm/contract/juno1s0klsaye2vuueet7utec6vmyua3pq6wv8ddr2phcrgg8v9gw9r5sqvfefv",
  enabled: true,
  verified: true,
  assets: [
    { kind: "native", id: "ujuno", symbol: "JUNO", name: "Juno", decimals: 6, logoURI: "https://example.com/juno.svg" },
    { kind: "ibc", id: "ibc/atomhash", symbol: "ATOM", name: "ATOM on Juno", decimals: 6, logoURI: "https://example.com/atom.svg", denomTrace: "transfer/channel-1/uatom" },
  ],
};

describe("PoolTable metadata rendering", () => {
  it("renders token logos, names, and IBC trace hints", () => {
    render(<MemoryRouter><PoolTable pools={[pool]} /></MemoryRouter>);

    expect(screen.getByAltText("JUNO logo").getAttribute("src")).toBe("https://example.com/juno.svg");
    expect(screen.getByAltText("ATOM logo").getAttribute("src")).toBe("https://example.com/atom.svg");
    expect(screen.getByText("Juno")).toBeTruthy();
    expect(screen.getByText("ATOM on Juno")).toBeTruthy();
    expect(screen.getByText("transfer/channel-1/uatom")).toBeTruthy();
  });
});
