import { formatAmount } from "../format/amounts";

const BPS_DENOMINATOR = 10_000n;

export type ProvideLiquidityQuote = {
  expectedLpAmount: string;
  poolShareBps: number;
  imbalanceBps: number;
  isProportional: boolean;
};

function normalizeBaseAmount(amount: string | number | bigint | undefined): bigint {
  if (amount === undefined || amount === null) return 0n;
  const raw = String(amount).trim();
  if (!/^\d+$/.test(raw)) return 0n;
  return BigInt(raw);
}

export function ratioAmount(inputAmount: string, inputReserve: string, outputReserve: string): string {
  const amount = normalizeBaseAmount(inputAmount);
  const reserveIn = normalizeBaseAmount(inputReserve);
  const reserveOut = normalizeBaseAmount(outputReserve);
  if (amount <= 0n || reserveIn <= 0n || reserveOut <= 0n) return "0";
  return ((amount * reserveOut) / reserveIn).toString();
}

export function calculateProvideLiquidityQuote({
  depositAmounts,
  reserves,
  totalShare,
}: {
  depositAmounts: [string, string];
  reserves: [string, string];
  totalShare: string;
}): ProvideLiquidityQuote | null {
  const amount0 = normalizeBaseAmount(depositAmounts[0]);
  const amount1 = normalizeBaseAmount(depositAmounts[1]);
  const reserve0 = normalizeBaseAmount(reserves[0]);
  const reserve1 = normalizeBaseAmount(reserves[1]);
  const share = normalizeBaseAmount(totalShare);

  if (amount0 <= 0n || amount1 <= 0n || reserve0 <= 0n || reserve1 <= 0n || share <= 0n) return null;

  const lpFrom0 = (amount0 * share) / reserve0;
  const lpFrom1 = (amount1 * share) / reserve1;
  const expectedLpAmount = lpFrom0 < lpFrom1 ? lpFrom0 : lpFrom1;
  const denominator = share + expectedLpAmount;
  const poolShareBps = denominator > 0n ? Number((expectedLpAmount * BPS_DENOMINATOR) / denominator) : 0;

  const ideal1 = (amount0 * reserve1) / reserve0;
  const diff = amount1 > ideal1 ? amount1 - ideal1 : ideal1 - amount1;
  const imbalanceBps = ideal1 > 0n ? Number((diff * BPS_DENOMINATOR) / ideal1) : 0;

  return {
    expectedLpAmount: expectedLpAmount.toString(),
    poolShareBps,
    imbalanceBps,
    isProportional: imbalanceBps <= 1,
  };
}

export function formatLpShareBps(bps: number): string {
  const percent = bps / 100;
  if (percent === 0) return "0%";
  if (percent < 0.01) return "<0.01%";
  return `${percent.toFixed(percent >= 10 ? 2 : 4).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

export function displayBaseAmount(baseAmount: string, decimals: number): string {
  return formatAmount(baseAmount, decimals, decimals).replace(/,/g, "");
}
