import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistryAsset } from "../config/registry";
import { dexRegistry } from "../config/registry";
import { createPairMessage, extractCreatedPairAddress, type CreatePoolConfigOption } from "../lib/createPool";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, type TxResult, useTxRunner } from "../tx/useTxRunner";
import type { ExecuteInstruction } from "../lib/cosmjs/fees";

type CreatePoolTxResult = TxResult & { pairAddress?: string };

export type CreatePoolTxVariables = {
  assets: [RegistryAsset, RegistryAsset];
  option: CreatePoolConfigOption;
};

export function buildCreatePoolExecuteInstruction({ assets, option }: CreatePoolTxVariables): ExecuteInstruction {
  return { contractAddress: dexRegistry.factory, msg: createPairMessage(assets, option.pairType) };
}

export function useCreatePoolTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation<CreatePoolTxResult, Error, CreatePoolTxVariables>({
    mutationFn: async (variables) => {
      return txRunner.runTx({
        title: "Create pool",
        pendingMessage: `Creating ${variables.assets[0].symbol} / ${variables.assets[1].symbol} ${variables.option.id.toUpperCase()} pool on Juno…`,
        variables,
        broadcast: async (input) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const instruction = buildCreatePoolExecuteInstruction(input);
          const result = await client.execute(sender, instruction.contractAddress, instruction.msg, "auto");
          return { ...result, pairAddress: extractCreatedPairAddress(result) };
        },
        successMessage: (_result, { assets, option }) => `Create pool submitted: ${assets[0].symbol} / ${assets[1].symbol} (${option.label}).`,
        onSuccess: async () => {
          await invalidateDexTxQueries(queryClient, sender);
          await queryClient.invalidateQueries({ queryKey: ["factory-pairs", dexRegistry.chainId, dexRegistry.factory] });
        },
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
