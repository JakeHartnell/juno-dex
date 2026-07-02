import { describe, expect, it } from "vitest";
import type { RegistryAsset, RegistryPool } from "../../config/registry";
import { createRouterSwapMessage, findSwapRoutes, routeSymbols } from "./routes";

const juno: RegistryAsset = { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6 };
const usdc: RegistryAsset = { kind: "ibc", id: "ibc/usdc", symbol: "USDC", decimals: 6 };
const atom: RegistryAsset = { kind: "ibc", id: "ibc/atom", symbol: "ATOM", decimals: 6 };
const whale: RegistryAsset = { kind: "cw20", id: "juno1whale000000000000000000000000000000000000", symbol: "WHALE", decimals: 6 };

function pool(id: string, assets: [RegistryAsset, RegistryAsset]): RegistryPool {
  return {
    id,
    label: `${assets[0].symbol} / ${assets[1].symbol}`,
    pair: `juno1${id.padEnd(38, "x")}`,
    lpToken: `factory/juno1${id}/lp`,
    type: "xyk",
    feeBps: 30,
    assets,
    explorer: `https://www.mintscan.io/juno/address/juno1${id}`,
    enabled: true,
  };
}

describe("swap route graph", () => {
  it("discovers direct and multi-hop astro_swap routes up to the hop limit", () => {
    const routes = findSwapRoutes([
      pool("junousdc", [juno, usdc]),
      pool("usdcatom", [usdc, atom]),
      pool("atomwhale", [atom, whale]),
    ], juno, atom, 3);

    expect(routes.map(routeSymbols)).toEqual(["JUNO → USDC → ATOM"]);
    expect(routes[0].operations).toEqual([
      { astro_swap: { offer_asset_info: { native_token: { denom: "ujuno" } }, ask_asset_info: { native_token: { denom: "ibc/usdc" } } } },
      { astro_swap: { offer_asset_info: { native_token: { denom: "ibc/usdc" } }, ask_asset_info: { native_token: { denom: "ibc/atom" } } } },
    ]);
  });

  it("prefers shorter candidates first and excludes routes beyond the hop limit", () => {
    const routes = findSwapRoutes([
      pool("junousdc", [juno, usdc]),
      pool("usdcatom", [usdc, atom]),
      pool("junowhale", [juno, whale]),
      pool("whaleatom", [whale, atom]),
      pool("junoatom", [juno, atom]),
    ], juno, atom, 1);

    expect(routes.map(routeSymbols)).toEqual(["JUNO → ATOM"]);
  });
});

describe("createRouterSwapMessage", () => {
  it("builds execute_swap_operations with astro_swap operations, min receive, max spread, and native funds", () => {
    const [route] = findSwapRoutes([pool("junousdc", [juno, usdc]), pool("usdcatom", [usdc, atom])], juno, atom, 2);
    const payload = createRouterSwapMessage(route, juno, "1000000", "0.005", "990000");

    expect(payload).toEqual({
      msg: {
        execute_swap_operations: {
          operations: route.operations,
          minimum_receive: "990000",
          max_spread: "0.005",
          to: undefined,
        },
      },
      funds: [{ denom: "ujuno", amount: "1000000" }],
    });
  });
});
