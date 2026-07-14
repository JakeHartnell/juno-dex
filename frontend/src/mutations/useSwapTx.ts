import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { dexRegistry } from "../config/registry";
import { createCw20SwapSendMessage, createSwapMessage } from "../lib/astroport/messages";
import { createCw20RouterSwapSendMessage, createRouterSwapMessage, type SwapRoute } from "../lib/astroport/routes";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { applyConfirmedExactBalanceDeltas, invalidateDexTxQueries, type TxResult, useTxRunner } from "../tx/useTxRunner";
import { formatAmount } from "../lib/format/amounts";
import type { ExecuteInstruction } from "../lib/cosmjs/fees";

export type SwapTxVariables = {
  pool?: RegistryPool;
  route: SwapRoute;
  offerAsset: RegistryAsset;
  askAsset: RegistryAsset;
  amount: string;
  maxSpread: string;
  minimumReceive: string;
  source: "pair" | "router";
};

export function buildSwapExecuteInstruction({ pool, route, offerAsset, askAsset, amount, maxSpread, minimumReceive, source }: SwapTxVariables): ExecuteInstruction {
  if (source === "pair") {
    const directPool = pool ?? route.hops[0]?.pool;
    if (!directPool) throw new Error("Direct swap route is missing its pair contract");
    if (offerAsset.kind === "cw20") {
      return { contractAddress: offerAsset.id, msg: createCw20SwapSendMessage(directPool.pair, askAsset, amount, maxSpread) };
    }
    const { msg, funds } = createSwapMessage(offerAsset, askAsset, amount, maxSpread);
    return { contractAddress: directPool.pair, msg, funds };
  }
  if (!dexRegistry.router) throw new Error("Router contract is not configured");
  if (offerAsset.kind === "cw20") {
    return { contractAddress: offerAsset.id, msg: createCw20RouterSwapSendMessage(dexRegistry.router, route, amount, maxSpread, minimumReceive) };
  }
  const { msg, funds } = createRouterSwapMessage(route, offerAsset, amount, maxSpread, minimumReceive);
  return { contractAddress: dexRegistry.router, msg, funds };
}

export function useSwapTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation<TxResult, Error, SwapTxVariables>({
    mutationFn: async (variables: SwapTxVariables) => {
      return txRunner.runTx({
        title: "Swap",
        pendingMessage: `Swapping ${variables.offerAsset.symbol} for ${variables.askAsset.symbol} on Juno…`,
        variables,
        broadcast: async (input) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const instruction = buildSwapExecuteInstruction(input);
          return client.execute(sender, instruction.contractAddress, instruction.msg, "auto", undefined, [...(instruction.funds ?? [])]);
        },
        successMessage: (_result, { amount, minimumReceive, offerAsset, askAsset }) => `Swap confirmed: ${formatAmount(amount, offerAsset.decimals)} ${offerAsset.symbol} for at least ${formatAmount(minimumReceive, askAsset.decimals)} ${askAsset.symbol}.`,
        onSuccess: (_result, { pool, route, offerAsset, amount }) => {
          if (offerAsset.kind !== "cw20" && offerAsset.id !== "ujuno") applyConfirmedExactBalanceDeltas(queryClient, sender, [{ denom: offerAsset.id, amount: `-${amount}` }]);
          return invalidateDexTxQueries(queryClient, sender, pool ?? route.hops[0]?.pool);
        },
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
