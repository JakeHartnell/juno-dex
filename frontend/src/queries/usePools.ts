import { useQuery } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { queryPairPool } from "../lib/astroport/queries";

export function usePoolReserves(pool: RegistryPool | undefined) {
  return useQuery({
    queryKey: ["pool", pool?.pair],
    enabled: Boolean(pool),
    queryFn: async () => {
      if (!pool) throw new Error("pool is required");
      return queryPairPool(pool.pair);
    },
  });
}
