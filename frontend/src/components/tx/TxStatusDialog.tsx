import type { DeliverTxResponse } from "@cosmjs/stargate";
import { dexRegistry } from "../../config/registry";

export function TxStatusDialog({ status, result, error }: { status: string; result?: DeliverTxResponse; error?: unknown }) {
  if (status === "idle") return null;
  const labelByStatus: Record<string, string> = {
    preparing: "Preparing transaction",
    signing: "Awaiting wallet signature",
    broadcasting: "Broadcasting to Juno",
    success: "Indexed successfully",
    failed: "Chain execution failed",
    rejected: "Rejected in wallet",
    timeout: "Broadcast timeout: verify on Mintscan",
  };
  return (
    <section className="tx-card">
      <strong>Transaction status</strong>
      <p>{labelByStatus[status] ?? status}</p>
      {result ? <a href={`${dexRegistry.explorerBaseUrl}/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">View on Mintscan</a> : null}
      {error ? <p className="error-text">{error instanceof Error ? error.message : String(error)}</p> : null}
    </section>
  );
}
