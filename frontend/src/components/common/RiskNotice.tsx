export function RiskNotice({ variant = "full" }: { variant?: "full" | "compact" }) {
  return (
    <aside className={`risk-notice risk-notice-${variant}`}>
      <strong>Review this transaction carefully.</strong> {variant === "compact" ? "Check the quote, route, and slippage before acting." : "Review the selected assets, pool address, route, and slippage before any transaction."}
    </aside>
  );
}
