import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { createClaimRewardsMessage, createStakeLpExecute, createUnstakeLpMessage, getIncentivesContractAddress } from "../lib/incentives";
import { resolveSigningClient, type SigningClientSource } from "../lib/cosmjs/clients";
import { applyConfirmedExactBalanceDeltas, invalidateDexTxQueries, useTxRunner } from "../tx/useTxRunner";
import { formatAmount } from "../lib/format/amounts";
import type { ExecuteInstruction } from "../lib/cosmjs/fees";

type IncentivesAction = "stake" | "unstake" | "claim";

export type IncentivesVariables = {
  action: IncentivesAction;
  pool: RegistryPool;
  amount?: string;
};

export function buildIncentivesExecuteInstruction({ action, pool, amount }: IncentivesVariables): ExecuteInstruction {
  const incentivesAddress = getIncentivesContractAddress();
  if (!incentivesAddress) throw new Error("Incentives contract is not configured");
  const { msg, funds } = buildIncentivesExecute(pool, action, amount);
  return { contractAddress: incentivesAddress, msg: msg as Record<string, unknown>, funds };
}

export function useIncentivesTx(signerOrClient: SigningClientSource, sender: string | undefined) {
  const queryClient = useQueryClient();
  const txRunner = useTxRunner();
  const mutation = useMutation({
    mutationFn: async (variables: IncentivesVariables) => {
      return txRunner.runTx({
        title: incentivesActionTitle(variables.action),
        pendingMessage: `${incentivesActionTitle(variables.action)} for ${variables.pool.label}…`,
        variables,
        broadcast: async (input) => {
          const client = await resolveSigningClient(signerOrClient);
          if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
          const instruction = buildIncentivesExecuteInstruction(input);
          return client.execute(sender, instruction.contractAddress, instruction.msg, "auto", undefined, [...(instruction.funds ?? [])]);
        },
        successMessage: (_result, { action, pool, amount }) => `${incentivesActionTitle(action)} confirmed for ${pool.label}${amount ? `: ${formatAmount(amount, 6)} LP tokens` : ""}.`,
        onSuccess: (_result, { pool, action, amount }) => {
          if (amount && action !== "claim") applyConfirmedExactBalanceDeltas(queryClient, sender, [{ denom: pool.lpToken, amount: `${action === "stake" ? "-" : ""}${amount}` }]);
          invalidateDexTxQueries(queryClient, sender, pool);
          void queryClient.invalidateQueries({ queryKey: ["incentives", pool.lpToken] });
        },
      });
    },
  });
  return { ...mutation, txState: txRunner.state, resetTx: txRunner.reset };
}

export function buildIncentivesExecute(pool: RegistryPool, action: IncentivesAction, amount?: string) {
  if (action === "stake") {
    if (!amount) throw new Error("Enter an LP amount to stake");
    return createStakeLpExecute(pool, amount);
  }
  if (action === "unstake") {
    if (!amount) throw new Error("Enter an LP amount to unstake");
    return { msg: createUnstakeLpMessage(pool, amount), funds: [] };
  }
  return { msg: createClaimRewardsMessage(pool), funds: [] };
}

function incentivesActionTitle(action: IncentivesAction) {
  if (action === "stake") return "Stake LP";
  if (action === "unstake") return "Unstake LP";
  return "Claim rewards";
}
