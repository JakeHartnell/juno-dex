import { useQuery } from "@tanstack/react-query";
import { getIndexerRuntimeConfig } from "../../lib/data-access/indexerFallback";
import { createIndexerClient } from "../../lib/indexer/client";

export function IndexerStatusBadge() {
  const config = getIndexerRuntimeConfig();
  const status = useQuery({
    queryKey: ["indexer-health", config.baseUrl, config.disabled],
    enabled: Boolean(config.baseUrl) && !config.disabled,
    queryFn: () => createIndexerClient({ baseUrl: config.baseUrl!, timeoutMs: config.timeoutMs }).health(),
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (config.disabled) return <strong className="status-warn">Disabled</strong>;
  if (!config.baseUrl) return <strong className="status-warn">Not configured</strong>;
  if (status.isLoading) return <strong>Checking…</strong>;
  if (status.isError) return <strong className="status-warn">Unavailable</strong>;
  if (status.data?.isMock) return <strong className="status-warn">Preview data</strong>;
  return <strong className="net-live">Healthy</strong>;
}
