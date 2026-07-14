import { describe, expect, it, vi } from "vitest";
import { fromUtf8 } from "@cosmjs/encoding";
import { estimateExecuteNetworkFee, executeInstructionToEncodeObject } from "./fees";

describe("network fee estimation", () => {
  it("simulates the exact execute message and applies the configured gas adjustment and JUNO gas price", async () => {
    const simulate = vi.fn().mockResolvedValue(100_000);
    const client = { execute: vi.fn(), simulate };
    const instruction = { contractAddress: "juno1pair", msg: { swap: { max_spread: "0.005" } }, funds: [{ denom: "ujuno", amount: "1000000" }] };
    const estimate = await estimateExecuteNetworkFee(async () => client as never, "juno1sender", [instruction]);

    expect(estimate).toEqual({ amountBase: "9750", amountJuno: "0.00975", gasUsed: 100_000, gasLimit: 130_000, gasPrice: 0.075 });
    const [, messages] = simulate.mock.calls[0];
    expect(messages[0].typeUrl).toBe("/cosmwasm.wasm.v1.MsgExecuteContract");
    expect(fromUtf8(messages[0].value.msg)).toBe(JSON.stringify(instruction.msg));
    expect(messages[0].value.funds).toEqual(instruction.funds);
  });

  it("returns unavailable when the wallet client cannot simulate", async () => {
    expect(await estimateExecuteNetworkFee(async () => ({ execute: vi.fn() }) as never, "juno1sender", [{ contractAddress: "juno1pair", msg: {} }])).toBeUndefined();
  });

  it("builds deterministic execute encode objects", () => {
    expect(executeInstructionToEncodeObject("juno1sender", { contractAddress: "juno1pair", msg: { claim: {} } })).toMatchObject({
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: { sender: "juno1sender", contract: "juno1pair", funds: [] },
    });
  });
});
