import type { Asset, PoolResponse } from "../generated/Pair.types";
import { estimateWithdrawAssets } from "./withdraw";

const BPS_DENOMINATOR = 10_000n;

function normalizeBaseAmount(amount: string | number | bigint | undefined): bigint {
  if (amount === undefined || amount === null) return 0n;
  const raw = String(amount).trim();
  if (!/^\d+$/.test(raw)) return 0n;
  return BigInt(raw);
}

export type LpPosition = {
  lpBalance: string;
  totalShare: string;
  shareBps: number;
  sharePercent: number;
  underlyingAssets: Asset[];
  hasPosition: boolean;
};

export function calculateLpShareBps(lpBalance: string | undefined, totalShare: string | undefined): number {
  const balance = normalizeBaseAmount(lpBalance);
  const total = normalizeBaseAmount(totalShare);
  if (balance <= 0n || total <= 0n) return 0;
  const bps = (balance * BPS_DENOMINATOR) / total;
  return Number(bps > BPS_DENOMINATOR ? BPS_DENOMINATOR : bps);
}

export function formatPositionSharePercent(shareBps: number): string {
  if (!Number.isFinite(shareBps) || shareBps <= 0) return "0%";
  if (shareBps < 1) return "<0.01%";
  const whole = Math.floor(shareBps / 100);
  const fraction = shareBps % 100;
  return `${whole}.${fraction.toString().padStart(2, "0")}%`;
}

export function estimateLpPosition(pool: PoolResponse | undefined, lpBalance: string | undefined): LpPosition {
  const normalizedBalance = normalizeBaseAmount(lpBalance).toString();
  const totalShare = normalizeBaseAmount(pool?.total_share).toString();
  const shareBps = calculateLpShareBps(normalizedBalance, totalShare);
  return {
    lpBalance: normalizedBalance,
    totalShare,
    shareBps,
    sharePercent: shareBps / 100,
    underlyingAssets: estimateWithdrawAssets(pool, normalizedBalance),
    hasPosition: normalizeBaseAmount(normalizedBalance) > 0n,
  };
}
