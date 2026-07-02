import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { RegistryAsset } from "../config/registry";
import { dexRegistry } from "../config/registry";
import { createPairMessage, extractCreatedPairAddress, type CreatePoolConfigOption } from "../lib/createPool";
import { getSigningClient } from "../lib/cosmjs/clients";
import { invalidateDexTxQueries, type TxResult, useTxRunner } from "../tx/useTxRunner";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

type CreatePoolTxResult = TxResult & { pairAddress?: string };

type CreatePoolTxVariables = {
  assets: [RegistryAsset, RegistryAsset];
  option: CreatePoolConfigOption;
};

async function resolveSigningClient(signerOrClient: OfflineSigner | SigningClientGetter | undefined) {
  if (!signerOrClient) return undefined;
  if (typeof signerOrClient === "function") return signerOrClient();
  return getSigningClient(signerOrClient);
}

export function useCreatePoolTx(signerOrClient: OfflineSigner | SigningClientGetter | undefined, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation<CreatePoolTxResult, Error, CreatePoolTxVariables>({
    mutationFn: async (variables) => {
      return txRunner.runTx({
        title: "Create pool",
        pendingMessage: `Creating ${variables.assets[0].symbol} / ${variables.assets[1].symbol} ${variables.option.id.toUpperCase()} pool on Juno…`,
        variables,
        broadcast: async ({ assets, option }) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const msg = createPairMessage(assets, option.pairType);
          const result = await client.execute(sender, dexRegistry.factory, msg, "auto");
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
