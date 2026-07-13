export const SUPPORTED_CANDLE_INTERVALS = ["5m", "1h", "1d"] as const;
export type CandleInterval = typeof SUPPORTED_CANDLE_INTERVALS[number];

const INTERVAL_MS: Record<CandleInterval, number> = {
  "5m": 5 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

export type SwapForCandle = {
  pairAddress: string;
  blockTime: string;
  offerAsset?: string;
  offerAmount?: string;
  askAsset?: string;
  returnAmount?: string;
};

export type DerivedSwapPrice = {
  baseAsset: string;
  quoteAsset: string;
  price: string;
  volume: string;
  volumeQuote: string;
};

export function isCandleInterval(value: string): value is CandleInterval {
  return (SUPPORTED_CANDLE_INTERVALS as readonly string[]).includes(value);
}

export function bucketStartFor(blockTime: string | Date, interval: CandleInterval): string {
  const date = blockTime instanceof Date ? blockTime : new Date(blockTime);
  if (Number.isNaN(date.getTime())) throw new Error(`invalid candle timestamp: ${blockTime}`);
  return new Date(Math.floor(date.getTime() / INTERVAL_MS[interval]) * INTERVAL_MS[interval]).toISOString();
}

function parsePositive(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error("invalid candle decimal");
  return value.toPrecision(18).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function deriveCanonicalSwapPrice(swap: SwapForCandle, decimals: Record<string, number> = {}): DerivedSwapPrice | undefined {
  if (!swap.offerAsset || !swap.askAsset || swap.offerAsset === swap.askAsset) return undefined;
  const offerRaw = parsePositive(swap.offerAmount);
  const returnRaw = parsePositive(swap.returnAmount);
  if (!offerRaw || !returnRaw) return undefined;

  const offer = offerRaw / 10 ** (decimals[swap.offerAsset] ?? 0);
  const returned = returnRaw / 10 ** (decimals[swap.askAsset] ?? 0);
  if (offer <= 0 || returned <= 0) return undefined;

  const offerIsBase = swap.offerAsset < swap.askAsset;
  const baseAsset = offerIsBase ? swap.offerAsset : swap.askAsset;
  const quoteAsset = offerIsBase ? swap.askAsset : swap.offerAsset;
  const baseVolume = offerIsBase ? offer : returned;
  const quoteVolume = offerIsBase ? returned : offer;
  const price = quoteVolume / baseVolume;
  if (!Number.isFinite(price) || price <= 0) return undefined;

  return {
    baseAsset,
    quoteAsset,
    price: formatDecimal(price),
    volume: formatDecimal(baseVolume),
    volumeQuote: formatDecimal(quoteVolume),
  };
}

export function aggregateSwapsToCandles(swaps: SwapForCandle[], interval: CandleInterval, decimals: Record<string, number> = {}) {
  const buckets = new Map<string, { bucketStart: string; open: string; high: string; low: string; close: string; volume: number; volumeQuote: number; tradeCount: number; baseAsset: string; quoteAsset: string; pairAddress: string }>();
  for (const swap of swaps) {
    const derived = deriveCanonicalSwapPrice(swap, decimals);
    if (!derived) continue;
    const key = `${swap.pairAddress}:${derived.baseAsset}:${derived.quoteAsset}:${bucketStartFor(swap.blockTime, interval)}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        bucketStart: bucketStartFor(swap.blockTime, interval),
        open: derived.price,
        high: derived.price,
        low: derived.price,
        close: derived.price,
        volume: Number(derived.volume),
        volumeQuote: Number(derived.volumeQuote),
        tradeCount: 1,
        baseAsset: derived.baseAsset,
        quoteAsset: derived.quoteAsset,
        pairAddress: swap.pairAddress,
      });
    } else {
      existing.high = formatDecimal(Math.max(Number(existing.high), Number(derived.price)));
      existing.low = formatDecimal(Math.min(Number(existing.low), Number(derived.price)));
      existing.close = derived.price;
      existing.volume += Number(derived.volume);
      existing.volumeQuote += Number(derived.volumeQuote);
      existing.tradeCount += 1;
    }
  }
  return [...buckets.values()].map((candle) => ({ ...candle, volume: formatDecimal(candle.volume), volumeQuote: formatDecimal(candle.volumeQuote) }));
}
