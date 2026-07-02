import { decodeTxError, type DecodedTxError } from "../../tx/errors";
import { txLifecycleLabel, type TxLifecycleState, type TxLifecycleStatus, type TxResult } from "../../tx/useTxRunner";

type LegacyTxStatusDialogProps = {
  status: TxLifecycleStatus | string;
  result?: TxResult;
  error?: unknown;
  retry?: () => void | Promise<void>;
};

type TxStatusDialogProps = LegacyTxStatusDialogProps | {
  state: TxLifecycleState;
};

function normalizeProps(props: TxStatusDialogProps): TxLifecycleState {
  if ("state" in props) return props.state;
  const status = props.status as TxLifecycleStatus;
  const decodedError: DecodedTxError | undefined = props.error ? decodeTxError(props.error) : undefined;
  return {
    status,
    label: txLifecycleLabel(status) ?? props.status,
    result: props.result,
    error: decodedError,
    description: decodedError?.message,
    retry: props.retry,
  };
}

export function TxStatusDialog(props: TxStatusDialogProps) {
  const state = normalizeProps(props);
  if (state.status === "idle") return null;

  const txHash = state.result?.transactionHash;
  const canRetry = Boolean(state.retry && state.status !== "success");

  return (
    <section className={`tx-card tx-card-${state.status}`} role="status" aria-live="polite">
      <strong>Transaction status</strong>
      <p>{state.label}</p>
      {state.description ? <p>{state.description}</p> : null}
      {txHash ? (
        <p>
          Tx hash: <code>{txHash}</code>
        </p>
      ) : null}
      {state.error ? (
        <details className="tx-error-detail">
          <summary>{state.error.title}</summary>
          <p>{state.error.message}</p>
          <code>{state.error.raw}</code>
        </details>
      ) : null}
      {canRetry ? <button type="button" onClick={() => void state.retry?.()}>Retry transaction</button> : null}
    </section>
  );
}
