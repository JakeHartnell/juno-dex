import { useQuery } from "@tanstack/react-query";
import type { RegistryAsset, RegistryPool } from "../config/registry";
import { querySwapSimulation } from "../lib/astroport/queries";

export function useSwapQuote(pool: RegistryPool | undefined, offerAsset: RegistryAsset | undefined, askAsset: RegistryAsset | undefined, amount: string) {
  return useQuery({
    queryKey: ["swap-quote", pool?.pair, offerAsset?.id, askAsset?.id, amount],
    enabled: Boolean(pool && offerAsset && askAsset && Number(amount) > 0),
    queryFn: async () => {
      if (!pool || !offerAsset || !askAsset) throw new Error("pool and assets are required");
      return querySwapSimulation(pool.pair, offerAsset, askAsset, amount);
    },
  });
}
