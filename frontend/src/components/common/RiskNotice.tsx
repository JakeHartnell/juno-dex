export function RiskNotice({ variant = "full" }: { variant?: "full" | "compact" }) {
  return (
    <aside className={`risk-notice risk-notice-${variant}`}>
      <strong>Experimental thin-liquidity preview.</strong> {variant === "compact" ? "Verify denoms, pair, slippage, and Mintscan before acting." : "This app targets the first Astroport-Juno v1 mainnet deployment. Verify denoms, pool address, slippage, and explorer links before any transaction."}
    </aside>
  );
}
