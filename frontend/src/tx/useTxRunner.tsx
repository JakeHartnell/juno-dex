import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { RegistryPool } from "../config/registry";
import { dexRegistry } from "../config/registry";
import { useToast } from "../components/common";
import { walletBalancesQueryKey } from "../queries/useWalletBalances";
import type { WalletBalance } from "../queries/useWalletBalances";
import { decodeTxError, type DecodedTxError } from "./errors";
import { useTxHistory } from "./TxHistoryContext";

export type TxLifecycleStatus = "idle" | "preparing" | "awaiting-signature" | "submitted" | "confirmed" | "failed" | "rejected" | "timed-out";

export type TxResult = {
  transactionHash: string;
};

export type TxLifecycleState = {
  status: TxLifecycleStatus;
  label: string;
  description?: string;
  result?: TxResult;
  error?: DecodedTxError;
  retry?: () => void | Promise<void>;
  refresh?: () => void | Promise<void>;
  actionLabel?: string;
};

export type RunTxOptions<T> = {
  title: string;
  pendingMessage?: string;
  successMessage?: (result: TxResult, variables: T) => string;
  broadcast: (variables: T) => Promise<TxResult>;
  variables: T;
  onSuccess?: (result: TxResult, variables: T) => Promise<unknown> | unknown;
  retry?: () => void | Promise<void>;
};

const statusLabels: Record<TxLifecycleStatus, string> = {
  idle: "Ready",
  preparing: "Preparing transaction",
  "awaiting-signature": "Awaiting wallet signature",
  submitted: "Submitted to Juno",
  confirmed: "Transaction confirmed",
  failed: "Transaction failed",
  rejected: "Rejected in wallet",
  "timed-out": "Confirmation timed out",
};

function statusFromError(error: DecodedTxError): Extract<TxLifecycleStatus, "rejected" | "timed-out" | "failed"> {
  if (error.kind === "user-rejected") return "rejected";
  if (error.kind === "timeout") return "timed-out";
  return "failed";
}

export function invalidateDexTxQueries(queryClient: QueryClient, sender: string | undefined, pool?: RegistryPool) {
  const invalidations: Promise<unknown>[] = [];
  if (sender) invalidations.push(queryClient.invalidateQueries({ queryKey: walletBalancesQueryKey(sender) }));
  invalidations.push(queryClient.invalidateQueries({ queryKey: ["swap-route-quote"] }));
  invalidations.push(queryClient.invalidateQueries({ queryKey: pool ? ["pool", pool.pair] : ["pool"] }));
  return Promise.all(invalidations);
}

export type ExactBalanceDelta = { denom: string; amount: string };

/**
 * Reconciles only confirmed, protocol-exact deltas in an existing balance cache.
 * Callers must not use this for JUNO spends (gas is not known here), estimated
 * swap receipts, LP mint estimates, rewards, or any other variable outcome.
 */
export function applyConfirmedExactBalanceDeltas(queryClient: QueryClient, sender: string | undefined, deltas: readonly ExactBalanceDelta[]) {
  if (!sender || deltas.length === 0) return;
  queryClient.setQueryData<WalletBalance[]>(walletBalancesQueryKey(sender), (current) => {
    if (!current) return current;
    const byDenom = new Map<string, bigint>();
    for (const delta of deltas) {
      if (!/^\-?\d+$/.test(delta.amount)) continue;
      byDenom.set(delta.denom, (byDenom.get(delta.denom) ?? 0n) + BigInt(delta.amount));
    }
    return current.map((balance) => {
      const delta = byDenom.get(balance.denom);
      if (delta === undefined || !/^\d+$/.test(balance.amount)) return balance;
      const next = BigInt(balance.amount) + delta;
      return { ...balance, amount: (next < 0n ? 0n : next).toString() };
    });
  });
}

export function TxHashLink({ txHash }: { txHash: string }) {
  return <a href={`${dexRegistry.explorerBaseUrl}/tx/${txHash}`} target="_blank" rel="noreferrer"><code>{txHash}</code><span className="sr-only"> — view transaction in explorer</span></a>;
}

export function useTxRunner() {
  const toast = useToast();
  const history = useTxHistory();
  const [state, setState] = useState<TxLifecycleState>({ status: "idle", label: statusLabels.idle });
  const inFlightRef = useRef<Promise<TxResult> | undefined>(undefined);

  const reset = useCallback(() => setState({ status: "idle", label: statusLabels.idle }), []);

  const runTx = useCallback(<T,>(options: RunTxOptions<T>): Promise<TxResult> => {
    // A second click while the wallet request is open must observe the same
    // transaction instead of broadcasting a duplicate irreversible action.
    if (inFlightRef.current) return inFlightRef.current;
    const task = (async () => {
    const txId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const retry = options.retry ?? (() => { void runTx(options); });
    setState({
      status: "preparing",
      label: statusLabels.preparing,
      description: "Building the transaction request and checking the connected account.",
      actionLabel: options.title,
    });
    history.upsert({ id: txId, title: options.title, status: "preparing", description: "Building the transaction request.", updatedAt: Date.now() });
    await Promise.resolve();
    setState({
      status: "awaiting-signature",
      label: statusLabels["awaiting-signature"],
      description: options.pendingMessage ?? "Confirm this transaction in your wallet, then wait for it to be broadcast.",
      actionLabel: options.title,
      retry,
    });
    history.upsert({ id: txId, title: options.title, status: "awaiting-signature", description: options.pendingMessage ?? "Confirm in wallet.", updatedAt: Date.now() });
    const pendingToastId = toast.pending({
      title: options.title,
      message: options.pendingMessage ?? "Waiting for wallet signature and Juno broadcast…",
    });

    try {
      const result = await options.broadcast(options.variables);
      setState({
        status: "confirmed",
        label: statusLabels.confirmed,
        description: options.successMessage?.(result, options.variables) ?? "Juno accepted and indexed the transaction.",
        result,
        actionLabel: options.title,
        refresh: async () => { await options.onSuccess?.(result, options.variables); },
      });
      const successDescription = options.successMessage?.(result, options.variables) ?? "Juno accepted and indexed the transaction.";
      history.upsert({ id: txId, title: options.title, status: "confirmed", description: successDescription, txHash: result.transactionHash, updatedAt: Date.now() });
      toast.dismiss(pendingToastId);
      toast.success({
        title: `${options.title} succeeded`,
        message: options.successMessage?.(result, options.variables) ?? "Transaction indexed successfully.",
        txHash: <TxHashLink txHash={result.transactionHash} />,
      });
      await options.onSuccess?.(result, options.variables);
      return result;
    } catch (caught) {
      const decoded = decodeTxError(caught);
      const status = statusFromError(decoded);
      setState({
        status,
        label: statusLabels[status],
        description: decoded.message,
        error: decoded,
        actionLabel: options.title,
        retry: decoded.retryable && status !== "timed-out" ? retry : undefined,
      });
      history.upsert({ id: txId, title: options.title, status, description: decoded.message, updatedAt: Date.now() });
      toast.dismiss(pendingToastId);
      toast.error({
        title: decoded.title,
        message: decoded.message,
      });
      throw caught;
    }
    })();
    inFlightRef.current = task;
    void task.finally(() => {
      if (inFlightRef.current === task) inFlightRef.current = undefined;
    }).catch(() => undefined);
    return task;
  }, [history, toast]);

  return useMemo(() => ({ state, runTx, reset }), [reset, runTx, state]);
}

export function txLifecycleLabel(status: TxLifecycleStatus) {
  return statusLabels[status];
}

export type TxStatusLink = ReactNode;
