import type { Coin } from "@cosmjs/stargate";
import type { MsgExecuteContractEncodeObject } from "@cosmjs/cosmwasm-stargate";
import { toUtf8 } from "@cosmjs/encoding";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { JUNO_CHAIN_INFO } from "../../config/chains";
import { formatAmount } from "../format/amounts";
import { resolveSigningClient, type SigningClientSource } from "./clients";

export type ExecuteInstruction = {
  contractAddress: string;
  msg: Record<string, unknown>;
  funds?: readonly Coin[];
};

export type NetworkFeeEstimate = {
  amountBase: string;
  amountJuno: string;
  gasUsed: number;
  gasLimit: number;
  gasPrice: number;
};

const GAS_ADJUSTMENT = 1.3;
const FEE_CURRENCY = JUNO_CHAIN_INFO.feeCurrencies[0];

export function executeInstructionToEncodeObject(sender: string, instruction: ExecuteInstruction): MsgExecuteContractEncodeObject {
  return {
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
      sender,
      contract: instruction.contractAddress,
      msg: toUtf8(JSON.stringify(instruction.msg)),
      funds: [...(instruction.funds ?? [])],
    }),
  };
}

export async function estimateExecuteNetworkFee(
  signerOrClient: SigningClientSource,
  sender: string | undefined,
  instructions: readonly ExecuteInstruction[],
): Promise<NetworkFeeEstimate | undefined> {
  if (!sender || instructions.length === 0) return undefined;
  const client = await resolveSigningClient(signerOrClient);
  if (!client?.simulate) return undefined;
  const gasUsed = await client.simulate(sender, instructions.map((instruction) => executeInstructionToEncodeObject(sender, instruction)), undefined);
  if (!Number.isFinite(gasUsed) || gasUsed <= 0) return undefined;
  const gasLimit = Math.ceil(gasUsed * GAS_ADJUSTMENT);
  const amountBase = Math.ceil(gasLimit * FEE_CURRENCY.gasPriceStep.average).toString();
  return {
    amountBase,
    amountJuno: formatAmount(amountBase, FEE_CURRENCY.coinDecimals, FEE_CURRENCY.coinDecimals),
    gasUsed,
    gasLimit,
    gasPrice: FEE_CURRENCY.gasPriceStep.average,
  };
}
