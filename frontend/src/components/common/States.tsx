import type { ReactNode } from "react";

export function Skeleton({ width = "100%", height = "1rem", className = "" }: { width?: string; height?: string; className?: string }) {
  return <span className={`skeleton ${className}`} style={{ width, height }} aria-hidden="true" />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className="state-card empty-state-card">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action ? <div className="state-action">{action}</div> : null}
    </section>
  );
}

export function ErrorState({ title = "Something went wrong", error, onRetry }: { title?: string; error?: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return (
    <section className="state-card error-state-card" role="alert">
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
      {onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}
    </section>
  );
}
