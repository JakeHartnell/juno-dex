import { useMutation } from "@tanstack/react-query";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { Coin } from "@cosmjs/stargate";
import type { RegistryPool } from "../config/registry";
import { createWithdrawLiquidityMessage } from "../lib/astroport/messages";
import { getSigningClient } from "../lib/cosmjs/clients";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

async function resolveSigningClient(signerOrClient: OfflineSigner | SigningClientGetter | undefined) {
  if (!signerOrClient) return undefined;
  if (typeof signerOrClient === "function") return signerOrClient();
  return getSigningClient(signerOrClient);
}

export function useWithdrawLiquidityTx(signerOrClient: OfflineSigner | SigningClientGetter | undefined, sender: string | undefined) {
  return useMutation({
    mutationFn: async ({ pool, lpAmount }: { pool: RegistryPool; lpAmount: string }) => {
      const client = await resolveSigningClient(signerOrClient);
      if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
      const funds: Coin[] = [{ denom: pool.lpToken, amount: lpAmount }];
      return client.execute(sender, pool.pair, createWithdrawLiquidityMessage(), "auto", undefined, funds);
    },
  });
}
