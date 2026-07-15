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

  // Failure-only: a healthy indexer is the expected case and renders no chrome.
  if (config.disabled) return <strong className="status-warn">Indexer disabled</strong>;
  if (!config.baseUrl) return <strong className="status-warn">Indexer not configured</strong>;
  if (status.isLoading) return null;
  if (status.isError) return <strong className="status-warn">Indexer unavailable</strong>;
  if (status.data?.isMock) return <strong className="status-warn">Preview data</strong>;
  return null;
}
