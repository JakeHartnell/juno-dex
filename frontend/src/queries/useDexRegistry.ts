import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { dexRegistry, enabledPools } from "../config/registry";
import { queryFactoryConfig, queryFactoryPairs } from "../lib/astroport/queries";
import { factoryFeeBpsByPairType, mergeDiscoveredPools, queryAllFactoryPairs } from "../lib/astroport/poolDiscovery";

export function useDexRegistry() {
  const discovery = useQuery({
    queryKey: ["factory-pairs", dexRegistry.chainId, dexRegistry.factory],
    queryFn: async () => {
      const [pairs, configResult] = await Promise.all([
        queryAllFactoryPairs(queryFactoryPairs),
        queryFactoryConfig().catch(() => undefined),
      ]);
      return { pairs, feeBpsByPairType: factoryFeeBpsByPairType(configResult?.pair_configs) };
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 2,
  });

  const pools = useMemo(
    () => discovery.data
      ? mergeDiscoveredPools(discovery.data.pairs, enabledPools, discovery.data.feeBpsByPairType)
      : enabledPools.map((pool) => ({ ...pool, source: "registry" as const, verified: true })),
    [discovery.data],
  );

  return { registry: dexRegistry, pools, discovery };
}
