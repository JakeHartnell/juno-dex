import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Coin } from "@cosmjs/stargate";
import type { RegistryPool } from "../config/registry";
import type { Asset } from "../lib/generated/Pair.types";
import { createWithdrawLiquidityMessage } from "../lib/astroport/messages";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { applyConfirmedExactBalanceDeltas, invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";
import { formatAmount } from "../lib/format/amounts";
import type { ExecuteInstruction } from "../lib/cosmjs/fees";

export type WithdrawLiquidityVariables = {
  pool: RegistryPool;
  lpAmount: string;
  minAssetsToReceive?: Asset[];
};

export function buildWithdrawLiquidityExecuteInstruction({ pool, lpAmount, minAssetsToReceive }: WithdrawLiquidityVariables): ExecuteInstruction {
  const funds: Coin[] = [{ denom: pool.lpToken, amount: lpAmount }];
  return { contractAddress: pool.pair, msg: createWithdrawLiquidityMessage(minAssetsToReceive), funds };
}

export function useWithdrawLiquidityTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: WithdrawLiquidityVariables) => {
      return txRunner.runTx({
        title: "Remove liquidity",
        pendingMessage: `Withdrawing liquidity from ${variables.pool.label}…`,
        variables,
        broadcast: async (input) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const instruction = buildWithdrawLiquidityExecuteInstruction(input);
          return client.execute(sender, instruction.contractAddress, instruction.msg, "auto", undefined, [...(instruction.funds ?? [])]);
        },
        successMessage: (_result, { pool, lpAmount }) => `Withdrawal confirmed for ${pool.label}: ${formatAmount(lpAmount, 6)} LP tokens.`,
        onSuccess: (_result, { pool, lpAmount }) => {
          applyConfirmedExactBalanceDeltas(queryClient, sender, [{ denom: pool.lpToken, amount: `-${lpAmount}` }]);
          return invalidateDexTxQueries(queryClient, sender, pool);
        },
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}
