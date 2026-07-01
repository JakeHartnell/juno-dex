import type { DeliverTxResponse } from "@cosmjs/stargate";
import { dexRegistry } from "../../config/registry";

export function TxStatusDialog({ status, result, error }: { status: string; result?: DeliverTxResponse; error?: unknown }) {
  if (status === "idle") return null;
  return (
    <section className="tx-card">
      <strong>Transaction</strong>
      <p>{status}</p>
      {result ? <a href={`${dexRegistry.explorerBaseUrl}/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">View on Mintscan</a> : null}
      {error ? <p className="error-text">{error instanceof Error ? error.message : String(error)}</p> : null}
    </section>
  );
}
