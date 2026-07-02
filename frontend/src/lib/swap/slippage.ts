export const SLIPPAGE_STORAGE_KEY = "juno-dex.slippage-bps";
export const DEFAULT_SLIPPAGE_BPS = 50;
export const SLIPPAGE_PRESET_BPS = [10, 50, 100] as const;
export const MIN_SLIPPAGE_BPS = 1;
export const MAX_SLIPPAGE_BPS = 5_000;

export type PriceImpactSeverity = "none" | "warning" | "high";

export type PriceImpact = {
  bps: number;
  severity: PriceImpactSeverity;
};

export function clampSlippageBps(bps: number): number {
  if (!Number.isFinite(bps)) return DEFAULT_SLIPPAGE_BPS;
  return Math.min(MAX_SLIPPAGE_BPS, Math.max(MIN_SLIPPAGE_BPS, Math.round(bps)));
}

export function slippagePercentToBps(percent: number): number {
  return clampSlippageBps(percent * 100);
}

export function slippageBpsToPercent(bps: number): number {
  return clampSlippageBps(bps) / 100;
}

export function formatSlippagePercent(bps: number): string {
  const percent = slippageBpsToPercent(bps);
  return Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function slippageBpsToMaxSpread(bps: number): string {
  const safeBps = BigInt(clampSlippageBps(bps));
  const whole = safeBps / 10_000n;
  const fraction = (safeBps % 10_000n).toString().padStart(4, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function calculateMinimumReceived(returnAmount: string, slippageBps: number): string {
  const amount = BigInt(returnAmount || "0");
  const safeBps = BigInt(clampSlippageBps(slippageBps));
  return ((amount * (10_000n - safeBps)) / 10_000n).toString();
}

export function calculatePriceImpactBps({ spreadAmount, returnAmount }: { spreadAmount?: string; returnAmount?: string }): number | null {
  if (!spreadAmount || !returnAmount) return null;
  const spread = BigInt(spreadAmount);
  const received = BigInt(returnAmount);
  const idealReturn = spread + received;
  if (spread <= 0n || idealReturn <= 0n) return 0;
  return Number((spread * 10_000n) / idealReturn);
}

export function classifyPriceImpact(priceImpactBps: number | null): PriceImpactSeverity {
  if (priceImpactBps === null || priceImpactBps < 100) return "none";
  if (priceImpactBps < 500) return "warning";
  return "high";
}

export function getPriceImpact(input: { spreadAmount?: string; returnAmount?: string }): PriceImpact | null {
  const bps = calculatePriceImpactBps(input);
  if (bps === null) return null;
  return { bps, severity: classifyPriceImpact(bps) };
}

export function formatBpsPercent(bps: number): string {
  const percent = bps / 100;
  return `${percent.toFixed(percent >= 10 ? 1 : 2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
