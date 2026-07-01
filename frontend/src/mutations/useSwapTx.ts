import { useMutation } from "@tanstack/react-query";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { createSwapMessage } from "../lib/astroport/messages";
import { getSigningClient } from "../lib/cosmjs/clients";

export function useSwapTx(signer: OfflineSigner | undefined, sender: string | undefined) {
  return useMutation({
    mutationFn: async ({ pool, offerAsset, askAsset, amount }: { pool: RegistryPool; offerAsset: RegistryAsset; askAsset: RegistryAsset; amount: string }) => {
      if (!signer || !sender) throw new Error("Connect Keplr before broadcasting");
      const client = await getSigningClient(signer);
      const { msg, funds } = createSwapMessage(offerAsset, askAsset, amount);
      return client.execute(sender, pool.pair, msg, "auto", undefined, funds);
    },
  });
}
