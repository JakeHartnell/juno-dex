export function formatAmount(amount: string | number | undefined, decimals = 6, maxFractionDigits = 6): string {
  if (amount === undefined || amount === null || amount === "") return "—";
  const numeric = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return String(amount);
  const value = numeric / 10 ** decimals;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(value);
}

export function toBaseAmount(value: string, decimals: number): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0";
  return Math.floor(numeric * 10 ** decimals).toString();
}
