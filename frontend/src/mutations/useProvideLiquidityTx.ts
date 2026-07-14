import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { createProvideLiquidityMessage } from "../lib/astroport/messages";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { applyConfirmedExactBalanceDeltas, invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";
import { formatAmount } from "../lib/format/amounts";
import type { ExecuteInstruction } from "../lib/cosmjs/fees";

export type ProvideLiquidityVariables = {
  pool: RegistryPool;
  amounts: [string, string];
  slippageTolerance?: string;
  minLpToReceive?: string;
};

export function buildProvideLiquidityExecuteInstruction({ pool, amounts, slippageTolerance, minLpToReceive }: ProvideLiquidityVariables): ExecuteInstruction {
  const { msg, funds } = createProvideLiquidityMessage(pool.assets, amounts, slippageTolerance, minLpToReceive);
  return { contractAddress: pool.pair, msg, funds };
}

export function useProvideLiquidityTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: ProvideLiquidityVariables) => {
      return txRunner.runTx({
        title: "Add liquidity",
        pendingMessage: `Providing liquidity to ${variables.pool.label}…`,
        variables,
        broadcast: async (input) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const instruction = buildProvideLiquidityExecuteInstruction(input);
          return client.execute(sender, instruction.contractAddress, instruction.msg, "auto", undefined, [...(instruction.funds ?? [])]);
        },
        successMessage: (_result, { pool, amounts }) => `Liquidity confirmed for ${pool.label}: ${formatAmount(amounts[0], pool.assets[0].decimals)} ${pool.assets[0].symbol} / ${formatAmount(amounts[1], pool.assets[1].decimals)} ${pool.assets[1].symbol}.`,
        onSuccess: (_result, { pool, amounts }) => {
          applyConfirmedExactBalanceDeltas(queryClient, sender, pool.assets.flatMap((asset, index) => asset.id === "ujuno" || asset.kind === "cw20" ? [] : [{ denom: asset.id, amount: `-${amounts[index]}` }]));
          return invalidateDexTxQueries(queryClient, sender, pool);
        },
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
