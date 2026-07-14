import { useQuery } from "@tanstack/react-query";
import { JUNO_CHAIN_INFO } from "../../config/chains";

export function ChainStatusBadge({ rpcEndpoint }: { rpcEndpoint: string }) {
  const fallbackEndpoints = JUNO_CHAIN_INFO.fallbackRpcs;
  const status = useQuery({
    queryKey: ["rpc-status", rpcEndpoint, fallbackEndpoints],
    queryFn: async () => {
      const check = async (endpoint: string) => {
        const response = await fetch(`${endpoint}/status`);
        if (!response.ok) throw new Error(`RPC status ${response.status}`);
        const json = await response.json() as { result?: { sync_info?: { latest_block_height?: string } } };
        return json.result?.sync_info?.latest_block_height ?? "unknown";
      };

      try {
        return { height: await check(rpcEndpoint), fallback: false };
      } catch (primaryError) {
        for (const endpoint of fallbackEndpoints) {
          try {
            return { height: await check(endpoint), fallback: true, endpoint };
          } catch {
            // Try the next configured endpoint before surfacing degraded status.
          }
        }
        throw primaryError;
      }
    },
    retry: 1,
    staleTime: 30_000,
  });

  const isFallback = Boolean(status.data?.fallback);

  return (
    <span
      className={`status-pill ${status.isError || isFallback ? "status-warn" : "status-ok"}`}
      title={isFallback ? "Primary RPC degraded; a configured fallback is responding." : status.isError ? "No configured RPC endpoint responded." : "Configured Juno RPC is responding."}
    >
      {status.isLoading ? "Juno RPC…" : status.isError ? "RPC degraded" : isFallback ? `Fallback RPC · Block ${status.data?.height}` : `Block ${status.data?.height}`}
    </span>
  );
}
