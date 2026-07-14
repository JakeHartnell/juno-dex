import { dexRegistry } from "../../config/registry";
import { useTxHistory } from "../../tx/TxHistoryContext";

const activeStatuses = new Set(["preparing", "awaiting-signature", "submitted"]);

export function TransactionCenter() {
  const { records, dismiss, centerOpen, setCenterOpen } = useTxHistory();
  if (records.length === 0) return null;
  const hasActiveTransaction = records.some((record) => activeStatuses.has(record.status));
  return (
    <aside id="recent-transactions" className="transaction-center" aria-label="Recent transaction status">
      <details open={hasActiveTransaction || centerOpen} onToggle={(event) => { if (!hasActiveTransaction) setCenterOpen(event.currentTarget.open); }}>
        <summary>Transactions ({records.length})</summary>
        <ul>
          {records.map((record) => (
            <li key={record.id}>
              <div><strong>{record.title}</strong><span>{record.status.replaceAll("-", " ")}</span></div>
              {record.description ? <p>{record.description}</p> : null}
              <div className="transaction-center-actions">
                {record.txHash ? <a href={`${dexRegistry.explorerBaseUrl}/tx/${record.txHash}`} target="_blank" rel="noreferrer">View in explorer</a> : null}
                {!activeStatuses.has(record.status) ? <button type="button" onClick={() => dismiss(record.id)}>Dismiss</button> : null}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
