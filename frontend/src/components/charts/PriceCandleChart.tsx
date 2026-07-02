import { useId, useMemo, useState } from "react";
import type { RegistryPool } from "../../config/registry";
import { dataSourceLabel, type PoolCandleRange } from "../../lib/data-access/indexerFallback";
import type { DataAccessState } from "../../lib/data-access/indexerFallback";
import type { IndexerCandleInterval, IndexerPoolCandle } from "../../lib/indexer/types";
import { usePoolCandles } from "../../queries/usePools";
import { EmptyState, ErrorState, Skeleton } from "../common";

const INTERVALS: IndexerCandleInterval[] = ["5m", "1h", "1d"];
const RANGES: PoolCandleRange[] = ["24h", "7d", "30d", "90d"];

type PriceCandleChartProps = {
  pool: RegistryPool;
  title?: string;
  compact?: boolean;
  showControls?: boolean;
  limit?: number;
};

export function PriceCandleChart({ pool, title = "Price chart", compact = false, showControls = !compact, limit = compact ? 40 : 200 }: PriceCandleChartProps) {
  const [interval, setInterval] = useState<IndexerCandleInterval>(compact ? "1h" : "1h");
  const [range, setRange] = useState<PoolCandleRange>(compact ? "24h" : "7d");
  const candles = usePoolCandles(pool, { interval, range, limit });
  const describedBy = useId();
  const sourceLabel = dataSourceLabel(candles.access);

  return (
    <section className={`price-chart-card ${compact ? "price-chart-compact" : ""}`} aria-labelledby={`${describedBy}-title`}>
      <div className="price-chart-header">
        <div>
          <h3 id={`${describedBy}-title`}>{title}</h3>
          <p id={describedBy} className="price-chart-subtitle">{pool.assets[0]?.symbol}/{pool.assets[1]?.symbol} OHLC candles · {sourceLabel}</p>
        </div>
      </div>

      {showControls ? <ChartControls interval={interval} range={range} onInterval={setInterval} onRange={setRange} /> : null}

      {candles.isLoading || candles.isFetching ? <div className="chart-loading"><Skeleton width="100%" /> Loading candles…</div> : null}
      {candles.access?.error ? <ErrorState title="Candle data unavailable" error={`${candles.access.error.message}. No synthetic chart data is shown.`} onRetry={() => void candles.refetch()} /> : null}
      {!candles.isLoading && !candles.access?.error && candles.data.length === 0 ? (
        <EmptyState title="No candles returned">The indexer did not return {interval} candles for {range}; no fake chart is displayed.</EmptyState>
      ) : null}
      {candles.data.length > 0 ? <SvgCandleChart candles={candles.data} compact={compact} labelId={describedBy} access={candles.access} /> : null}
    </section>
  );
}

function ChartControls({ interval, range, onInterval, onRange }: { interval: IndexerCandleInterval; range: PoolCandleRange; onInterval: (interval: IndexerCandleInterval) => void; onRange: (range: PoolCandleRange) => void }) {
  return (
    <div className="chart-controls" aria-label="Price chart controls">
      <div className="segmented-control" aria-label="Candle interval">
        {INTERVALS.map((candidate) => <button key={candidate} type="button" className={candidate === interval ? "active" : ""} onClick={() => onInterval(candidate)}>{candidate}</button>)}
      </div>
      <div className="segmented-control" aria-label="Chart range">
        {RANGES.map((candidate) => <button key={candidate} type="button" className={candidate === range ? "active" : ""} onClick={() => onRange(candidate)}>{candidate}</button>)}
      </div>
    </div>
  );
}

function SvgCandleChart({ candles, compact, labelId, access }: { candles: IndexerPoolCandle[]; compact: boolean; labelId: string; access?: DataAccessState }) {
  const width = compact ? 280 : 760;
  const height = compact ? 86 : 260;
  const pad = compact ? 8 : 28;
  const geometry = useMemo(() => buildGeometry(candles, width, height, pad), [candles, height, pad, width]);
  const last = candles.at(-1);
  const first = candles[0];
  const change = first && last && first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const changeClass = change >= 0 ? "status-ok" : "status-danger";

  return (
    <div className="chart-render" role="img" aria-describedby={labelId} aria-label={`${candles.length} price candles from ${formatDate(first?.bucketStart)} to ${formatDate(last?.bucketStart)}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="price-chart-svg" data-testid="price-candle-svg">
        <defs>
          <linearGradient id={`${labelId}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(51, 214, 255, 0.28)" />
            <stop offset="100%" stopColor="rgba(51, 214, 255, 0.02)" />
          </linearGradient>
        </defs>
        <path d={geometry.areaPath} fill={`url(#${labelId}-fill)`} />
        <path d={geometry.linePath} fill="none" stroke="var(--juno-color-cyan)" strokeWidth={compact ? 2 : 2.5} vectorEffect="non-scaling-stroke" />
        {!compact ? geometry.candles.map((candle) => (
          <g key={candle.key} className={candle.up ? "candle-up" : "candle-down"}>
            <line x1={candle.x} x2={candle.x} y1={candle.highY} y2={candle.lowY} />
            <rect x={candle.x - candle.bodyWidth / 2} y={candle.bodyY} width={candle.bodyWidth} height={candle.bodyHeight} rx="1" />
          </g>
        )) : null}
      </svg>
      <div className="chart-summary">
        <span>Last <strong>{formatPrice(last?.close)}</strong></span>
        <span className={`status-pill ${changeClass}`}>{formatPercent(change)}</span>
        <span>{dataSourceLabel(access)}</span>
      </div>
    </div>
  );
}

function buildGeometry(candles: IndexerPoolCandle[], width: number, height: number, pad: number) {
  const prices = candles.flatMap((candle) => [candle.high, candle.low, candle.open, candle.close]).filter((value) => Number.isFinite(value));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.max(max, 1) * 0.02;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;
  const y = (price: number) => pad + ((max - price) / span) * plotHeight;
  const x = (index: number) => pad + (candles.length === 1 ? plotWidth / 2 : (index / (candles.length - 1)) * plotWidth);
  const points = candles.map((candle, index) => ({ x: x(index), y: y(candle.close) }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = points.length ? `${linePath} L${points.at(-1)!.x.toFixed(2)} ${height - pad} L${points[0].x.toFixed(2)} ${height - pad} Z` : "";
  const bodyWidth = Math.max(3, Math.min(12, plotWidth / Math.max(candles.length, 1) * 0.55));
  return {
    linePath,
    areaPath,
    candles: candles.map((candle, index) => {
      const openY = y(candle.open);
      const closeY = y(candle.close);
      return {
        key: `${candle.bucketStart}-${index}`,
        x: x(index),
        highY: y(candle.high),
        lowY: y(candle.low),
        bodyY: Math.min(openY, closeY),
        bodyHeight: Math.max(2, Math.abs(openY - closeY)),
        bodyWidth,
        up: candle.close >= candle.open,
      };
    }),
  };
}

function formatPrice(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatDate(value: string | undefined) {
  if (!value) return "unknown";
  return new Date(value).toLocaleString();
}
