import { useMutation } from "@tanstack/react-query";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { Coin } from "@cosmjs/stargate";
import type { RegistryPool } from "../config/registry";
import { createWithdrawLiquidityMessage } from "../lib/astroport/messages";
import { getSigningClient } from "../lib/cosmjs/clients";

export function useWithdrawLiquidityTx(signer: OfflineSigner | undefined, sender: string | undefined) {
  return useMutation({
    mutationFn: async ({ pool, lpAmount }: { pool: RegistryPool; lpAmount: string }) => {
      if (!signer || !sender) throw new Error("Connect Keplr before broadcasting");
      const client = await getSigningClient(signer);
      const funds: Coin[] = [{ denom: pool.lpToken, amount: lpAmount }];
      return client.execute(sender, pool.pair, createWithdrawLiquidityMessage(), "auto", undefined, funds);
    },
  });
}
