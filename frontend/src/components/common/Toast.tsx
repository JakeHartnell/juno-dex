import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ToastKind = "pending" | "success" | "error";
type Toast = { id: string; kind: ToastKind; title: string; message?: string; txHash?: ReactNode };
type ToastInput = Omit<Toast, "id" | "kind">;

type ToastContextValue = {
  pending: (toast: ToastInput) => string;
  success: (toast: ToastInput) => string;
  error: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function nextToastId() {
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, toast: ToastInput) => {
    const id = nextToastId();
    setToasts((current) => [...current, { ...toast, id, kind }]);
    return id;
  }, []);
  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const value = useMemo<ToastContextValue>(() => ({
    pending: (toast) => push("pending", toast),
    success: (toast) => push("success", toast),
    error: (toast) => push("error", toast),
    dismiss,
  }), [dismiss, push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (toast.kind !== "success" || paused) return;
    const timer = window.setTimeout(onDismiss, 6_000);
    return () => window.clearTimeout(timer);
  }, [onDismiss, paused, toast.kind]);
  return (
          <article className={`toast toast-${toast.kind}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
            <span className="toast-kind-icon" aria-hidden="true">{toast.kind === "success" ? "✓" : toast.kind === "error" ? "!" : "…"}</span>
            <div>
              <strong>{toast.title}</strong>
              {toast.message ? <p>{toast.message}</p> : null}
              {toast.txHash ? <div className="toast-hash">{toast.txHash}</div> : null}
            </div>
            <button type="button" aria-label={`Dismiss ${toast.title}`} onClick={onDismiss}>×</button>
          </article>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
