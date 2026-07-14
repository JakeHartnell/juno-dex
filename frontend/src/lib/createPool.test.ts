import { describe, expect, it } from "vitest";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import type { PairConfig } from "./generated/Factory.types";
import { createPairMessage, createPoolOptions, extractCreatedPairAddress, makeCustomAsset, validateCreatePool } from "./createPool";

const juno: RegistryAsset = { kind: "native", id: "ujuno", symbol: "JUNO", decimals: 6, verified: true };
const atom: RegistryAsset = { kind: "ibc", id: "ibc/atom", symbol: "ATOM", decimals: 6, verified: true };
const unknown: RegistryAsset = { kind: "native", id: "factory/juno1creator/unknown", symbol: "UNKNOWN", decimals: 6, verified: false };
const cw20: RegistryAsset = { kind: "cw20", id: "juno1cw20contract00000000000000000000000000000", symbol: "CW", decimals: 6, verified: true };

const configs: PairConfig[] = [
  { code_id: 1, pair_type: { xyk: {} }, total_fee_bps: 30, maker_fee_bps: 10, permissioned: false },
  { code_id: 2, pair_type: { stable: {} }, total_fee_bps: 5, maker_fee_bps: 2, is_disabled: true },
  { code_id: 3, pair_type: { custom: "concentrated" }, total_fee_bps: 20, maker_fee_bps: 10, permissioned: true },
];

describe("create pool helpers", () => {
  it("builds factory create_pair messages from generated Factory types", () => {
    expect(createPairMessage([juno, atom], { xyk: {} })).toEqual({
      create_pair: {
        pair_type: { xyk: {} },
        asset_infos: [{ native_token: { denom: "ujuno" } }, { native_token: { denom: "ibc/atom" } }],
        init_params: undefined,
      },
    });
    const cw20Message = createPairMessage([juno, cw20], { xyk: {} });
    if (!("create_pair" in cw20Message)) throw new Error("expected create_pair message");
    expect(cw20Message.create_pair.asset_infos).toEqual([
      { native_token: { denom: "ujuno" } },
      { token: { contract_addr: cw20.id } },
    ]);
  });

  it("maps live factory configs to disabled and permissionless options", () => {
    const options = createPoolOptions(configs);
    expect(options.find((option) => option.id === "xyk")).toMatchObject({ feeBps: 30, disabled: false });
    expect(options.find((option) => option.id === "stable")).toMatchObject({ disabled: true, unsupportedReason: "This pool type is currently disabled." });
    expect(options.find((option) => option.id === "concentrated")).toMatchObject({ disabled: true, permissioned: true });
  });

  it("blocks duplicates and unacknowledged unverified assets", () => {
    const option = createPoolOptions(configs)[0];
    const existing: RegistryPool = {
      id: "existing",
      label: "JUNO / ATOM",
      pair: "juno1existing00000000000000000000000000000000",
      lpToken: "factory/juno1existing/share",
      type: "xyk",
      feeBps: 30,
      assets: [juno, atom],
      explorer: "https://example.com",
      enabled: true,
      status: "active",
    };

    expect(validateCreatePool({ assets: [juno, atom], option, existingPair: existing, riskAcknowledged: true }).error).toBe("A pool already exists for these assets");
    expect(validateCreatePool({ assets: [juno, unknown], option, riskAcknowledged: false })).toMatchObject({ isValid: false, error: "Acknowledge unverified asset risk", requiresAcknowledgement: true });
    expect(validateCreatePool({ assets: [juno, unknown], option, riskAcknowledged: true }).isValid).toBe(true);
    expect(validateCreatePool({ assets: [juno, { ...unknown, blocked: true }], option, riskAcknowledged: true })).toMatchObject({
      isValid: false,
      error: "Blocked assets cannot be used to create pools",
      requiresAcknowledgement: false,
    });
  });

  it("creates fallback custom assets and extracts created pair addresses from tx events", () => {
    expect(makeCustomAsset({ kind: "cw20", id: "juno1cw20contract00000000000000000000000000000", symbol: "CW", decimals: 6 })).toMatchObject({ kind: "cw20", symbol: "CW", verified: false });
    expect(extractCreatedPairAddress({ events: [{ type: "wasm", attributes: [{ key: "pair_contract_addr", value: "juno1newpair000000000000000000000000000000000" }] }] })).toBe("juno1newpair000000000000000000000000000000000");
  });
});
