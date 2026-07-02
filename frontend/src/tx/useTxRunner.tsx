import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { dexRegistry, type RegistryPool } from "../config/registry";
import { ExplorerLink, useToast } from "../components/common";
import { walletBalancesQueryKey } from "../queries/useWalletBalances";
import { decodeTxError, type DecodedTxError } from "./errors";

export type TxLifecycleStatus = "idle" | "preparing" | "signing" | "broadcasting" | "success" | "failed" | "rejected" | "timeout";

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
  signing: "Awaiting wallet signature",
  broadcasting: "Broadcasting to Juno",
  success: "Transaction succeeded",
  failed: "Transaction failed",
  rejected: "Rejected in wallet",
  timeout: "Broadcast timeout",
};

export function mintscanTxUrl(txHash: string) {
  return `${dexRegistry.explorerBaseUrl}/tx/${txHash}`;
}

function statusFromError(error: DecodedTxError): TxLifecycleStatus {
  if (error.kind === "user-rejected") return "rejected";
  if (error.kind === "timeout") return "timeout";
  return "failed";
}

export function invalidateDexTxQueries(queryClient: QueryClient, sender: string | undefined, pool?: RegistryPool) {
  const invalidations: Promise<unknown>[] = [];
  if (sender) invalidations.push(queryClient.invalidateQueries({ queryKey: walletBalancesQueryKey(sender) }));
  invalidations.push(queryClient.invalidateQueries({ queryKey: ["swap-route-quote"] }));
  invalidations.push(queryClient.invalidateQueries({ queryKey: pool ? ["pool", pool.pair] : ["pool"] }));
  return Promise.all(invalidations);
}

export function TxHashLink({ txHash }: { txHash: string }) {
  return <ExplorerLink href={mintscanTxUrl(txHash)}>{txHash}</ExplorerLink>;
}

export function useTxRunner() {
  const toast = useToast();
  const [state, setState] = useState<TxLifecycleState>({ status: "idle", label: statusLabels.idle });

  const reset = useCallback(() => setState({ status: "idle", label: statusLabels.idle }), []);

  const runTx = useCallback(async <T,>(options: RunTxOptions<T>) => {
    const retry = options.retry ?? (() => { void runTx(options); });
    setState({
      status: "signing",
      label: statusLabels.signing,
      description: options.pendingMessage ?? "Confirm this transaction in your wallet, then wait for it to be broadcast.",
      actionLabel: options.title,
      retry,
    });
    const pendingToastId = toast.pending({
      title: options.title,
      message: options.pendingMessage ?? "Waiting for wallet signature and Juno broadcast…",
    });

    try {
      const result = await options.broadcast(options.variables);
      setState({
        status: "success",
        label: statusLabels.success,
        description: options.successMessage?.(result, options.variables) ?? "Juno accepted and indexed the transaction.",
        result,
        actionLabel: options.title,
      });
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
        retry: decoded.retryable ? retry : undefined,
      });
      toast.dismiss(pendingToastId);
      toast.error({
        title: decoded.title,
        message: decoded.message,
      });
      throw caught;
    }
  }, [toast]);

  return useMemo(() => ({ state, runTx, reset }), [reset, runTx, state]);
}

export function txLifecycleLabel(status: TxLifecycleStatus) {
  return statusLabels[status];
}

export type TxStatusLink = ReactNode;
