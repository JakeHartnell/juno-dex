import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { configuredPools, dexRegistry, isPoolTradeable } from "../config/registry";
import { isE2EMode } from "../e2e/mocks";
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
    () => {
      const merged = discovery.data
        ? mergeDiscoveredPools(discovery.data.pairs, configuredPools, discovery.data.feeBpsByPairType)
        : configuredPools.map((pool) => ({ ...pool, source: "registry" as const }));
      // The committed registry intentionally contains no public markets. The
      // isolated E2E build promotes its deterministic fixtures so browser
      // tests can exercise transaction flows without weakening production.
      return isE2EMode()
        ? merged.map((pool) => ({
            ...pool,
            status: "active" as const,
            enabled: true,
            verified: true,
            assets: pool.assets.map((asset) => ({ ...asset, verified: true })) as typeof pool.assets,
          }))
        : merged.filter(isPoolTradeable);
    },
    [discovery.data],
  );

  return { registry: dexRegistry, pools, discovery };
}
