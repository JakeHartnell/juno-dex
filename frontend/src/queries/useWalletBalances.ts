import { useQuery } from "@tanstack/react-query";
import { StargateClient } from "@cosmjs/stargate";
import { dexRegistry } from "../config/registry";

export function useWalletBalances(address: string | undefined) {
  return useQuery({
    queryKey: ["balances", address],
    enabled: Boolean(address),
    queryFn: async () => {
      if (!address) return [];
      const client = await StargateClient.connect(dexRegistry.rpcEndpoint);
      return client.getAllBalances(address);
    },
  });
}
