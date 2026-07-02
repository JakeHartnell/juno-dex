import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

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
        {toasts.map((toast) => (
          <article className={`toast toast-${toast.kind}`} key={toast.id}>
            <div>
              <strong>{toast.title}</strong>
              {toast.message ? <p>{toast.message}</p> : null}
              {toast.txHash ? <div className="toast-hash">{toast.txHash}</div> : null}
            </div>
            <button type="button" aria-label={`Dismiss ${toast.title}`} onClick={() => dismiss(toast.id)}>×</button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
