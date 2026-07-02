import { useMutation } from "@tanstack/react-query";
import type { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import type { RegistryPool } from "../config/registry";
import { createProvideLiquidityMessage } from "../lib/astroport/messages";
import { getSigningClient } from "../lib/cosmjs/clients";

type SigningClientGetter = () => Promise<SigningCosmWasmClient>;

async function resolveSigningClient(signerOrClient: OfflineSigner | SigningClientGetter | undefined) {
  if (!signerOrClient) return undefined;
  if (typeof signerOrClient === "function") return signerOrClient();
  return getSigningClient(signerOrClient);
}

export function useProvideLiquidityTx(signerOrClient: OfflineSigner | SigningClientGetter | undefined, sender: string | undefined) {
  return useMutation({
    mutationFn: async ({ pool, amounts }: { pool: RegistryPool; amounts: [string, string] }) => {
      const client = await resolveSigningClient(signerOrClient);
      if (!client || !sender) throw new Error("Connect a wallet before broadcasting");
      const { msg, funds } = createProvideLiquidityMessage(pool.assets, amounts);
      return client.execute(sender, pool.pair, msg, "auto", undefined, funds);
    },
  });
}
