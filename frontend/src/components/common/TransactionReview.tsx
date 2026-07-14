import type { ReactNode } from "react";
import { Modal } from "./Modal";
import type { NetworkFeeEstimate } from "../../lib/cosmjs/fees";

export type TransactionReviewRow = {
  label: string;
  value: ReactNode;
  tone?: "default" | "warning" | "danger";
};

export type TransactionReviewDisclosure = {
  label: string;
  value: ReactNode;
};

export function TransactionReview({
  open,
  title,
  description,
  account,
  chainId,
  rows,
  disclosures = [],
  networkFeeEstimate,
  warning,
  confirmDisabled = false,
  pending = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  account?: string;
  chainId?: string;
  rows: TransactionReviewRow[];
  disclosures?: TransactionReviewDisclosure[];
  networkFeeEstimate?: NetworkFeeEstimate;
  warning?: ReactNode;
  confirmDisabled?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="transaction-review">
        <p className="transaction-review-description">{description}</p>
        <dl className="quote-rows swap-review-rows">
          <div><dt>Connected account</dt><dd className="quote-row-value"><code>{account ?? "Unavailable"}</code></dd></div>
          <div><dt>Network</dt><dd className="quote-row-value">{chainId ?? "Unavailable"}</dd></div>
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd className={`quote-row-value${row.tone === "warning" ? " status-warn" : row.tone === "danger" ? " status-danger" : ""}`}>{row.value}</dd>
            </div>
          ))}
          <div>
            <dt>Estimated network fee</dt>
            <dd className={`quote-row-value${networkFeeEstimate ? "" : " status-warn"}`}>
              {networkFeeEstimate ? `≈ ${networkFeeEstimate.amountJuno} JUNO` : "Unavailable — wallet will calculate before signature"}
            </dd>
          </div>
        </dl>
        {disclosures.length > 0 ? (
          <details className="transaction-review-disclosure">
            <summary>Contracts and identifiers</summary>
            <dl className="quote-details">
              {disclosures.map((item) => <div key={item.label}><dt>{item.label}</dt><dd className="quote-detail-value"><code>{item.value}</code></dd></div>)}
            </dl>
          </details>
        ) : null}
        {warning ? <div className="price-impact-warning price-impact-danger" role="alert">{warning}</div> : null}
        <button type="button" className="primary-action" disabled={confirmDisabled || pending} onClick={onConfirm}>
          {pending ? "Confirming…" : "Confirm in wallet"}
        </button>
      </div>
    </Modal>
  );
}
