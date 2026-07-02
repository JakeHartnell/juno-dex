const BASIS_POINTS = 10_000;
const DAYS_PER_YEAR = 365;

export function parseFiniteNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function maybeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = parseFiniteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateTradingFeeApr({ volume24hUsd, feeBps, tvlUsd }) {
  const volume = parseFiniteNumber(volume24hUsd);
  const fee = parseFiniteNumber(feeBps);
  const tvl = parseFiniteNumber(tvlUsd);
  if (volume <= 0 || fee <= 0 || tvl <= 0) return 0;
  return ((volume * (fee / BASIS_POINTS) * DAYS_PER_YEAR) / tvl) * 100;
}

export function calculateIncentiveApr({ emissionsPerDayUsd, tvlUsd }) {
  const emissions = parseFiniteNumber(emissionsPerDayUsd);
  const tvl = parseFiniteNumber(tvlUsd);
  if (emissions <= 0 || tvl <= 0) return 0;
  return ((emissions * DAYS_PER_YEAR) / tvl) * 100;
}

export function sumApr(parts) {
  return Object.values(parts).reduce((total, value) => total + parseFiniteNumber(value), 0);
}

export function normalizePoolRecord(record) {
  const pairAddress = record.pairAddress ?? record.pair_address ?? record.pair ?? record.address ?? record.id;
  const id = record.id ?? pairAddress;
  if (!id || !pairAddress) throw new Error("pool record requires id or pairAddress");

  const tvlUsd = maybeNumber(record.tvlUsd ?? record.tvl_usd);
  const volume24hUsd = maybeNumber(record.volume24hUsd ?? record.volume_24h_usd ?? record.volume24h_usd);
  const volume7dUsd = maybeNumber(record.volume7dUsd ?? record.volume_7d_usd);
  const feeBps = maybeNumber(record.feeBps ?? record.fee_bps);
  const fees24hUsd = maybeNumber(record.fees24hUsd ?? record.fees_24h_usd ?? (volume24hUsd !== null && feeBps !== null ? volume24hUsd * feeBps / BASIS_POINTS : null));
  const feeApr = maybeNumber(record.feeApr ?? record.fee_apr) ?? calculateTradingFeeApr({ volume24hUsd, feeBps, tvlUsd });
  const incentivesApr = maybeNumber(record.incentivesApr ?? record.incentives_apr) ?? calculateIncentiveApr({ emissionsPerDayUsd: record.emissionsPerDayUsd ?? record.emissions_per_day_usd, tvlUsd });
  const totalApr = maybeNumber(record.totalApr ?? record.total_apr) ?? sumApr({ feeApr, incentivesApr });

  return {
    id,
    pair: pairAddress,
    pairAddress,
    lpToken: record.lpToken ?? record.lp_token ?? null,
    poolType: record.poolType ?? record.pool_type ?? null,
    assets: Array.isArray(record.assets) ? record.assets : [],
    tvlUsd,
    volume24hUsd,
    volume7dUsd,
    feeBps,
    fees24hUsd,
    feeApr,
    incentivesApr,
    totalApr,
    incentivized: Boolean(record.incentivized ?? incentivesApr > 0),
    updatedAt: record.updatedAt ?? record.updated_at ?? new Date(0).toISOString(),
    dataSource: record.dataSource ?? record.data_source ?? "indexer",
    isMock: Boolean(record.isMock ?? record.is_mock),
  };
}

export function normalizePositionRecord(record) {
  return {
    walletAddress: record.walletAddress ?? record.wallet_address,
    poolId: record.poolId ?? record.pool_id ?? record.pairAddress ?? record.pair_address,
    pairAddress: record.pairAddress ?? record.pair_address ?? record.poolId ?? record.pool_id,
    lpToken: record.lpToken ?? record.lp_token ?? null,
    lpBalance: String(record.lpBalance ?? record.lp_balance ?? "0"),
    shareBps: maybeNumber(record.shareBps ?? record.share_bps) ?? 0,
    valueUsd: maybeNumber(record.valueUsd ?? record.value_usd),
    assets: Array.isArray(record.assets) ? record.assets : [],
    updatedAt: record.updatedAt ?? record.updated_at ?? new Date(0).toISOString(),
    dataSource: record.dataSource ?? record.data_source ?? "indexer",
    isMock: Boolean(record.isMock ?? record.is_mock),
  };
}

export function normalizeTxRecord(record) {
  return {
    txHash: record.txHash ?? record.tx_hash,
    walletAddress: record.walletAddress ?? record.wallet_address ?? null,
    poolId: record.poolId ?? record.pool_id ?? record.pairAddress ?? record.pair_address ?? null,
    pairAddress: record.pairAddress ?? record.pair_address ?? null,
    type: record.type ?? "unknown",
    height: Number(record.height ?? 0),
    timestamp: record.timestamp ?? record.blockTime ?? record.block_time ?? new Date(0).toISOString(),
    offerAsset: record.offerAsset ?? record.offer_asset ?? null,
    askAsset: record.askAsset ?? record.ask_asset ?? null,
    amountUsd: maybeNumber(record.amountUsd ?? record.amount_usd),
    feeUsd: maybeNumber(record.feeUsd ?? record.fee_usd),
    success: record.success !== false,
    dataSource: record.dataSource ?? record.data_source ?? "indexer",
    isMock: Boolean(record.isMock ?? record.is_mock),
  };
}
