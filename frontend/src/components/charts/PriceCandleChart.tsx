import { useId, useMemo, useState } from "react";
import type { RegistryPool } from "../../config/registry";
import { type PoolCandleRange } from "../../lib/data-access/indexerFallback";
import type { IndexerCandleInterval, IndexerPoolCandle } from "../../lib/indexer/types";
import { usePoolCandles } from "../../queries/usePools";
import { OptionalDataState, Skeleton } from "../common";

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
  const latest = candles.data.at(-1);
  const first = candles.data[0];
  const change = first && latest && first.open > 0 ? ((latest.close - first.open) / first.open) * 100 : 0;

  return (
    <section className={`price-chart-card ${compact ? "price-chart-compact" : ""}`} aria-labelledby={`${describedBy}-title`}>
      <div className="price-chart-header">
        <div>
          <h3 id={`${describedBy}-title`}>{title}</h3>
          <p id={describedBy} className="price-chart-subtitle">{pool.assets[0]?.symbol}/{pool.assets[1]?.symbol} price in {pool.assets[1]?.symbol}</p>
        </div>
        {candles.data.length > 0 ? (
          <div className="chart-price-readout">
            <small>Price ({pool.assets[1]?.symbol ?? "quote"})</small>
            <strong>{formatPrice(latest?.close)}</strong>
            <span className={`market-change ${change >= 0 ? "up" : "down"}`}>{formatPercent(change)}</span>
          </div>
        ) : null}
      </div>

      {showControls ? <ChartControls interval={interval} range={range} onInterval={setInterval} onRange={setRange} /> : null}

      {candles.data.length > 0 && candles.access?.updatedAt ? (
        <p className="optional-data-timestamp">{candles.access.isStale ? "Last available" : "Updated"} {formatDataTime(candles.access.updatedAt)}</p>
      ) : null}

      {candles.isLoading || candles.isFetching ? <div className="chart-loading"><Skeleton width="100%" /> Loading candles…</div> : null}
      {candles.access?.error ? <OptionalDataState title="Price history is unavailable" onRetry={() => void candles.refetch()}>Trading and pool actions are unaffected.</OptionalDataState> : null}
      {!candles.isLoading && !candles.access?.error && candles.data.length === 0 ? (
        <OptionalDataState title="No price history yet">No {interval} prices were returned for {range}. Trading and pool actions are unaffected.</OptionalDataState>
      ) : null}
      {candles.data.length > 0 ? <SvgCandleChart candles={candles.data} compact={compact} labelId={describedBy} unit={pool.assets[1]?.symbol ?? "quote"} /> : null}
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

function SvgCandleChart({ candles, compact, labelId, unit }: { candles: IndexerPoolCandle[]; compact: boolean; labelId: string; unit: string }) {
  const width = compact ? 280 : 760;
  const height = compact ? 86 : 260;
  const pad = compact ? 8 : 18;
  const geometry = useMemo(() => buildGeometry(candles, width, height, pad), [candles, height, pad, width]);
  const [hoveredPointKey, setHoveredPointKey] = useState<string | null>(null);
  const hoveredPoint = geometry.points.find((point) => point.key === hoveredPointKey);
  const last = candles.at(-1);
  const first = candles[0];
  const low = Math.min(...candles.map((candle) => candle.low));
  const high = Math.max(...candles.map((candle) => candle.high));

  return (
    <div className="chart-render" role="img" tabIndex={0} aria-describedby={labelId} aria-label={`${candles.length} price candles from ${formatDate(first?.bucketStart)} to ${formatDate(last?.bucketStart)}. Latest ${formatPrice(last?.close)} ${unit}; range ${formatPrice(low)} to ${formatPrice(high)} ${unit}.`}>
      <div className={`chart-plot ${compact ? "chart-plot-compact" : ""}`}>
        {!compact ? (
          <div className="chart-y-labels" aria-hidden="true">
            <strong className="chart-y-unit">{unit}</strong>
            {geometry.yTicks.map((tick) => <span key={`y-${tick.value}`} style={{ top: `${tick.yPct}%` }}>{formatPrice(tick.value)}</span>)}
          </div>
        ) : null}
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="price-chart-svg" data-testid="price-candle-svg">
          <defs>
            <linearGradient id={`${labelId}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255, 123, 124, 0.18)" />
              <stop offset="100%" stopColor="rgba(255, 123, 124, 0.02)" />
            </linearGradient>
          </defs>
          {!compact ? (
            <g className="chart-axis" aria-hidden="true">
              {geometry.yTicks.map((tick) => <line key={`grid-y-${tick.value}`} x1={pad} x2={width - pad} y1={tick.y} y2={tick.y} />)}
              {geometry.xTicks.map((tick) => <line key={`grid-x-${tick.label}-${tick.x}`} x1={tick.x} x2={tick.x} y1={pad} y2={height - pad} />)}
              <line className="chart-axis-line" x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} />
            </g>
          ) : null}
          <path className="spark-fill" d={geometry.areaPath} fill={`url(#${labelId}-fill)`} />
          <path className="spark-line" d={geometry.linePath} />
          {!compact ? geometry.points.map((point) => (
            <g
              key={point.key}
              className="chart-point-group"
              aria-hidden="true"
              data-point-label={`${formatDate(point.bucketStart)} close ${formatPrice(point.value)} ${unit}`}
              onMouseEnter={() => setHoveredPointKey(point.key)}
              onMouseLeave={() => setHoveredPointKey(null)}
            >
              <circle className="chart-point-hit" cx={point.x} cy={point.y} r="11" />
              <circle className="chart-point" cx={point.x} cy={point.y} r="3.4" />
            </g>
          )) : null}
        </svg>
        {!compact ? (
          <>
            {hoveredPoint ? (
              <div className="chart-hover-labels" aria-hidden="true">
                <span className={`chart-hover-label ${hoveredPoint.anchor} visible`} style={{ left: `${hoveredPoint.xPct}%`, top: `${hoveredPoint.yPct}%` }}>
                  <small>{formatAxisDate(hoveredPoint.bucketStart)}</small>
                  <strong>{formatPrice(hoveredPoint.value)} {unit}</strong>
                </span>
              </div>
            ) : null}
            <div className="chart-x-labels" aria-hidden="true">
              {geometry.xTicks.map((tick) => <span key={`x-${tick.label}-${tick.x}`} style={{ left: `${tick.xPct}%` }}>{tick.label}</span>)}
            </div>
          </>
        ) : null}
      </div>
      {!compact ? (
        <details className="chart-data-summary">
          <summary>Accessible price summary</summary>
          <table>
            <caption>Price range shown in the chart</caption>
            <tbody>
              <tr><th scope="row">Start</th><td>{formatDate(first?.bucketStart)} · {formatPrice(first?.open)} {unit}</td></tr>
              <tr><th scope="row">Latest</th><td>{formatDate(last?.bucketStart)} · {formatPrice(last?.close)} {unit}</td></tr>
              <tr><th scope="row">Low</th><td>{formatPrice(low)} {unit}</td></tr>
              <tr><th scope="row">High</th><td>{formatPrice(high)} {unit}</td></tr>
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

function buildGeometry(candles: IndexerPoolCandle[], width: number, height: number, pad: number) {
  const prices = candles.flatMap((candle) => [candle.high, candle.low, candle.open, candle.close]).filter((value) => Number.isFinite(value));
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const rawSpan = rawMax - rawMin;
  const padding = rawSpan > 0 ? rawSpan * 0.08 : Math.max(Math.abs(rawMax), 1) * 0.01;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const span = max - min || 1;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;
  const y = (price: number) => pad + ((max - price) / span) * plotHeight;
  const x = (index: number) => pad + (candles.length === 1 ? plotWidth / 2 : (index / (candles.length - 1)) * plotWidth);
  const pointPct = (value: number, total: number) => (value / total) * 100;
  const points = candles.map((candle, index) => {
    const px = x(index);
    const py = y(candle.close);
    return {
      key: `${candle.bucketStart}-${index}`,
      bucketStart: candle.bucketStart,
      x: px,
      y: py,
      xPct: pointPct(px, width),
      yPct: pointPct(py, height),
      value: candle.close,
      anchor: index === 0 ? "right" : index === candles.length - 1 ? "left" : py < height / 2 ? "below" : "above",
    };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = points.length ? `${linePath} L${points.at(-1)!.x.toFixed(2)} ${height - pad} L${points[0].x.toFixed(2)} ${height - pad} Z` : "";
  const bodyWidth = Math.max(3, Math.min(12, plotWidth / Math.max(candles.length, 1) * 0.55));
  const yTicks = [max, min + span / 2, min].map((value) => ({ value, y: y(value), yPct: pointPct(y(value), height) }));
  const xTickIndexes = Array.from(new Set([0, Math.floor((candles.length - 1) / 2), candles.length - 1])).filter((index) => index >= 0);
  return {
    linePath,
    areaPath,
    points,
    yTicks,
    xTicks: xTickIndexes.map((index) => ({ x: x(index), xPct: pointPct(x(index), width), label: formatAxisDate(candles[index]?.bucketStart) })),
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

function formatAxisDate(value: string | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric" }).format(new Date(value));
}

function formatDataTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "at an unknown time";
  return parsed.toLocaleString();
}
