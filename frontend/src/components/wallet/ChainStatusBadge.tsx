import { useQuery } from "@tanstack/react-query";

export function ChainStatusBadge({ rpcEndpoint }: { rpcEndpoint: string }) {
  const status = useQuery({
    queryKey: ["rpc-status", rpcEndpoint],
    queryFn: async () => {
      const response = await fetch(`${rpcEndpoint}/status`);
      if (!response.ok) throw new Error(`RPC status ${response.status}`);
      const json = await response.json() as { result?: { sync_info?: { latest_block_height?: string } } };
      return json.result?.sync_info?.latest_block_height ?? "unknown";
    },
    retry: 1,
    staleTime: 30_000,
  });

  return (
    <span className={`status-pill ${status.isError ? "status-warn" : "status-ok"}`}>
      {status.isLoading ? "Juno RPC…" : status.isError ? "RPC degraded" : `Block ${status.data}`}
    </span>
  );
}
