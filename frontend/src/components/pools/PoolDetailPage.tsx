import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import type { RegistryAsset, RegistryPool } from "../../config/registry";
import type { PoolResponse } from "../../lib/astroport/queries";
import { formatAmount } from "../../lib/format/amounts";
import { getPoolTotalApr } from "../../lib/pools/poolList";
import type { PoolMetrics } from "../../lib/pools/poolList";
import { getPoolTypeMetadata } from "../../lib/pools/poolTypes";
import { useDexRegistry } from "../../queries/useDexRegistry";
import { usePoolActivity, usePoolMetrics, usePoolReserves } from "../../queries/usePools";
import { PriceCandleChart } from "../charts/PriceCandleChart";
import { Modal, TokenLogo } from "../common";
import { IncentivesPanel } from "../incentives/IncentivesPanel";
import { AddLiquidityForm } from "../liquidity/AddLiquidityForm";
import { LpPositionPanel } from "../liquidity/LpPositionPanel";
import { RemoveLiquidityForm } from "../liquidity/RemoveLiquidityForm";
import { WalletTransactionHistory } from "../wallet/WalletTransactionHistory";

export function PoolDetailPage() {
  const { pairAddress } = useParams();
  const { pools, discovery, registry } = useDexRegistry();
  const [manageAction, setManageAction] = useState<"add" | "remove" | "stake" | null>(null);
  const pool = pools.find((candidate) => candidate.pair === pairAddress);
  const poolMetrics = usePoolMetrics(pool ? [pool] : []);
  const poolActivity = usePoolActivity(pool, 50);
  const reserves = usePoolReserves(pool);
  const metrics = pool ? poolMetrics.data?.[pool.pair] : undefined;
  const poolType = pool ? getPoolTypeMetadata(pool.type) : undefined;

  if (!pool) {
    return <section className="panel-page"><h2>Pool not found</h2><p className="empty-state">This pair was not found in factory discovery or the curated Juno registry.{discovery.isError ? " Factory discovery is currently degraded." : ""}</p><Link to="/pools">Back to pools</Link></section>;
  }

  const poolStatus = reserves.isFetching ? "Refreshing" : reserves.data ? "Live reserves" : "Reserve query unavailable";

  return (
    <section className="panel-page pool-detail-page">
      <header className="pool-detail-header">
        <div className="pool-detail-lead">
          <p className="eyebrow pool-detail-eyebrow">Pool · {pool.assets.map((asset) => asset.symbol).join(" / ")}</p>
          <h2>{pool.label}</h2>
          <p className="pool-detail-meta">{poolType?.label ?? pool.type.toUpperCase()} · {pool.feeBps} bps fee</p>
        </div>
        <Link className="pool-detail-back" to="/pools">← Back to pools</Link>
      </header>

      <div className="pool-detail-identity" aria-label="Contract identity">
        <p className="eyebrow">Contract identity</p>
        <div className="pool-identity-row">
          <span className="pool-identity-label">Pair</span>
          <code>{pool.pair}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(pool.pair)}>Copy</button>
        </div>
        <div className="pool-identity-row">
          <span className="pool-identity-label">LP token</span>
          <details className="identifier-disclosure"><summary>Show token ID</summary><code>{pool.lpToken}</code></details>
          <button type="button" onClick={() => navigator.clipboard?.writeText(pool.lpToken)}>Copy</button>
        </div>
      </div>
      {reserves.isError ? <p className="error-text">Live reserve query failed: {reserves.error instanceof Error ? reserves.error.message : String(reserves.error)}</p> : null}
      {poolMetrics.access?.error ? <p className="error-text">Pool metrics are temporarily unavailable.</p> : null}

      <section className="pool-detail-section" aria-labelledby="analytics-title">
        <h3 id="analytics-title">Analytics</h3>
        <div className="metrics-grid" aria-label="Pool analytics cards">
          <MetricCard label="TVL" value={formatMarketValue(metrics?.tvlUsd, metrics?.tvlJuno) ?? "Metrics unavailable"} hint={hasMarketValue(metrics?.tvlUsd, metrics?.tvlJuno) ? "Updated market data" : "Requires pricing data"} />
          <MetricCard label="24h volume" value={formatMarketValue(metrics?.volume24hUsd, metrics?.volume24hJuno) ?? "Metrics unavailable"} hint={hasMarketValue(metrics?.volume24hUsd, metrics?.volume24hJuno) ? "Updated market data" : "Requires volume data"} />
          <MetricCard label="APR" value={formatApr(getPoolTotalApr(metrics)) ?? "Metrics unavailable"} hint={metrics ? aprHint(metrics) : "Requires fee and incentives data"} />
          <MetricCard label="Pool type" value={poolType?.label ?? pool.type.toUpperCase()} hint={`${pool.feeBps} bps fee tier · ${poolType?.feeCopy ?? "pool fee"}`} />
          <MetricCard label="Total share" value={reserves.data ? formatAmount(reserves.data.total_share, 6) : "—"} hint="LP token supply" />
          <MetricCard label="Query status" value={poolStatus} hint={reserves.data ? "Pair contract queried through RPC" : "RPC degraded or not queried"} />
        </div>
        {!metrics ? (
          <p className="pool-metrics-copy">TVL, 24h volume, and APR are unavailable for this pool.</p>
        ) : null}
      </section>

      <section className="pool-detail-section" aria-labelledby="composition-title">
        <h3 id="composition-title">Reserve composition</h3>
        <div className="metrics-grid">
          {pool.assets.map((asset, index) => (
            <ReserveCard key={asset.id} asset={asset} index={index} pool={pool} reserves={reserves.data} />
          ))}
          <MetricCard label="Current price" value={formatCurrentPrice(pool, reserves.data)} hint={`${poolType?.swapCopy ?? "Spot ratio from reserves"} Spot ratio from ${pool.assets[0].symbol} and ${pool.assets[1].symbol} reserves`} />
        </div>
      </section>

      <section className="pool-detail-section" aria-labelledby="share-math-title">
        <h3 id="share-math-title">Share math</h3>
        <dl className="quote-details lp-underlying-list">
          <div><dt>Total LP shares</dt><dd className="quote-detail-value">{reserves.data ? formatAmount(reserves.data.total_share, 6) : "Unavailable until reserve query succeeds"}</dd></div>
          <div><dt>LP accounting</dt><dd className="quote-detail-value">Your pool share = wallet LP balance ÷ total LP shares. Underlying estimates in the position panel multiply that share by each reserve.</dd></div>
          <div><dt>Pricing caveat</dt><dd className="quote-detail-value">USD value, volume, and APR require market data and are never inferred from reserves alone. {poolType?.withdrawCopy}</dd></div>
        </dl>
      </section>

      <section className="pool-detail-section" aria-labelledby="params-title">
        <h3 id="params-title">Type-specific parameters</h3>
        <dl className="quote-details lp-underlying-list">
          <div><dt>Pair type</dt><dd className="quote-detail-value">{poolType?.label ?? pool.type.toUpperCase()}</dd></div>
          <div><dt>Fee tier</dt><dd className="quote-detail-value">{pool.feeBps} bps · {poolType?.feeCopy}</dd></div>
          <div><dt>{pool.type === "stable" ? "Stable amp" : pool.type === "concentrated" ? "PCL parameters" : "XYK parameters"}</dt><dd className="quote-detail-value">{typeSpecificCopy(pool)}</dd></div>
        </dl>
      </section>

      <section className="pool-detail-section">
        <PriceCandleChart pool={pool} title="Price chart" />
      </section>

      <section id="position"><LpPositionPanel pool={pool} compact onAdd={() => setManageAction("add")} onRemove={() => setManageAction("remove")} onStake={() => setManageAction("stake")} /></section>

      <section className="pool-detail-section" aria-labelledby="manage-liquidity-title">
        <h3 id="manage-liquidity-title">Manage liquidity</h3>
        <p className="pool-metrics-copy">Add or remove liquidity, or manage LP incentives without leaving this market.</p>
        <div className="manage-liquidity-actions">
          <button type="button" onClick={() => setManageAction("add")}>Add liquidity</button>
          <button type="button" onClick={() => setManageAction("remove")}>Remove liquidity</button>
          <button type="button" onClick={() => setManageAction("stake")}>Manage incentives</button>
        </div>
      </section>

      <Modal open={manageAction === "add"} title={`Add liquidity · ${pool.label}`} onClose={() => setManageAction(null)}><AddLiquidityForm pool={pool} /></Modal>
      <Modal open={manageAction === "remove"} title={`Remove liquidity · ${pool.label}`} onClose={() => setManageAction(null)}><RemoveLiquidityForm pool={pool} /></Modal>
      <Modal open={manageAction === "stake"} title={`LP incentives · ${pool.label}`} onClose={() => setManageAction(null)}><IncentivesPanel pool={pool} metrics={metrics} /></Modal>

      <section className="pool-detail-section" aria-label="Recent pool transactions">
        <WalletTransactionHistory
          title="Recent pool activity"
          emptyTitle="No indexed transactions for this pool"
          history={poolActivity.data}
          access={poolActivity.access}
          walletConnected
          isLoading={poolActivity.isLoading}
          pairAddress={pool.pair}
          pool={pool}
          explorerBaseUrl={registry.explorerBaseUrl}
        />
      </section>
    </section>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const muted = value === "Metrics unavailable" || value === "—" || value === "Unavailable";
  const long = value.length > 22;
  const valueClass = [muted ? "metric-value-muted" : "", long ? "metric-value-long" : ""].filter(Boolean).join(" ") || undefined;
  return <div className="metric-card"><span>{label}</span><strong className={valueClass}>{value}</strong>{hint ? <code>{hint}</code> : null}</div>;
}

function ReserveCard({ asset, index, pool, reserves }: { asset: RegistryAsset; index: number; pool: RegistryPool; reserves: PoolResponse | undefined }) {
  const reserve = reserves?.assets[index]?.amount;
  const share = reserveCompositionPercent(pool, reserves, index);
  return (
    <div className="metric-card">
    <span className="pool-asset-heading"><TokenLogo asset={asset} size="sm" /> {asset.name ?? asset.symbol}</span>
    <strong>{reserve ? `${formatAmount(reserve, asset.decimals)} ${asset.symbol}` : "—"}</strong>
    <code>{share ?? "Composition unavailable"}</code>
    {asset.denomTrace ? <small>{asset.denomTrace}</small> : null}
    <details className="identifier-disclosure"><summary>Asset ID</summary><code>{asset.id}</code></details>
    </div>
  );
}

function typeSpecificCopy(pool: RegistryPool) {
  const metadata = getPoolTypeMetadata(pool.type);
  if (pool.type === "stable") return `${metadata.detailCopy} Amp is not exposed by the current registry/discovery query; contract config wiring is required before showing it.`;
  if (pool.type === "concentrated") return `${metadata.detailCopy} PCL parameters are not exposed by the current registry/discovery query; contract config wiring is required before showing them.`;
  return metadata.detailCopy;
}

function reserveCompositionPercent(pool: RegistryPool, reserves: PoolResponse | undefined, index: number) {
  if (!reserves) return undefined;
  const normalized = pool.assets.map((asset, assetIndex) => normalizedNumber(reserves.assets[assetIndex]?.amount, asset.decimals));
  const total = normalized.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format((normalized[index] / total) * 100)}% of token units`;
}

function formatCurrentPrice(pool: RegistryPool, reserves: PoolResponse | undefined) {
  if (!reserves) return "—";
  const base = normalizedNumber(reserves.assets[0]?.amount, pool.assets[0].decimals);
  const quote = normalizedNumber(reserves.assets[1]?.amount, pool.assets[1].decimals);
  if (!Number.isFinite(base) || !Number.isFinite(quote) || base <= 0 || quote <= 0) return "Unavailable";
  const price = quote / base;
  const inverse = base / quote;
  return `1 ${pool.assets[0].symbol} ≈ ${formatRatio(price)} ${pool.assets[1].symbol} · 1 ${pool.assets[1].symbol} ≈ ${formatRatio(inverse)} ${pool.assets[0].symbol}`;
}

function normalizedNumber(amount: string | undefined, decimals: number) {
  if (!amount || !/^\d+$/.test(amount)) return 0;
  return Number(amount) / 10 ** decimals;
}

function formatRatio(value: number) {
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(value);
}

function formatUsd(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatJuno(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)} JUNO`;
}

function formatMarketValue(usdValue: number | null | undefined, junoValue: number | null | undefined) {
  return formatUsd(usdValue) ?? formatJuno(junoValue);
}

function hasMarketValue(usdValue: number | null | undefined, junoValue: number | null | undefined) {
  return formatMarketValue(usdValue, junoValue) !== undefined;
}

function formatApr(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

function aprHint(metrics: PoolMetrics) {
  const parts = [];
  if (typeof metrics.feeApr === "number") parts.push(`fees ${formatApr(metrics.feeApr)}`);
  if (typeof metrics.incentivesApr === "number") parts.push(`incentives ${formatApr(metrics.incentivesApr)}`);
  return parts.length > 0 ? parts.join(" + ") : "Market data";
}
