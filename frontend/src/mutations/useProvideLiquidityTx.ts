import { useMutation } from "@tanstack/react-query";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { RegistryPool } from "../config/registry";
import { createProvideLiquidityMessage } from "../lib/astroport/messages";
import { getSigningClient } from "../lib/cosmjs/clients";

export function useProvideLiquidityTx(signer: OfflineSigner | undefined, sender: string | undefined) {
  return useMutation({
    mutationFn: async ({ pool, amounts }: { pool: RegistryPool; amounts: [string, string] }) => {
      if (!signer || !sender) throw new Error("Connect Keplr before broadcasting");
      const client = await getSigningClient(signer);
      const { msg, funds } = createProvideLiquidityMessage(pool.assets, amounts);
      return client.execute(sender, pool.pair, msg, "auto", undefined, funds);
    },
  });
}
